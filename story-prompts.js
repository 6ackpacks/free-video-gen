import { randomUUID } from 'node:crypto';

export const STORY_SCENES = {
  reenactment: {
    name: '生活场景模拟',
    direction: '真实中国城市生活场景，像手机随手拍的剧情短片；两名成年人面对面发生轻微争执，表演自然，不舞台化。',
    camera: '第一人称旁观式或近距离手持中景，单一连续镜头，小幅跟随人物。'
  },
  ktv: {
    name: 'KTV 场景',
    direction: '真实商务 KTV 包厢，霓虹氛围灯、沙发、歌词屏幕和矮桌清楚可见；两名成年人因消费或礼物话题发生简短争执。',
    camera: '竖屏手机中景，保持两人同框，KTV 灯光鲜明但面部可辨。'
  },
  surveillance: {
    name: '监控视角',
    direction: '真实店铺、走廊或柜台区域，固定高位广角监控视角；两名成年人发生简短争执，完整动作都在固定画面内。',
    camera: '镜头全程静止，高位俯拍，轻微低清、灰蒙、噪点与压缩痕迹，不切镜头。'
  }
};

const clean = (value, max = 3000) => String(value || '').trim().slice(0, max);
const quote = value => `“${clean(value, 70).replace(/[“”]/g, '')}”`;

export function buildStoryPrompt({ index = 1, brandName, brief, sceneId, duration = 15, template, priorities = '', storyIdea = '', subjectId, draft = {} }) {
  const scene = STORY_SCENES[sceneId] || STORY_SCENES.reenactment;
  duration = validateStoryDuration(duration);
  const brand = clean(brandName, 80);
  if (!brand) throw new Error('甲方名称不能为空');
  const facts = clean(brief, 30000);
  if (!facts) throw new Error('请填写甲方需要宣传的内容');
  const excerpts = Array.isArray(draft.factsUsed) ? draft.factsUsed.map(value => clean(value, 500)).filter(value => value && facts.includes(value)).slice(0, 5) : [];
  if (facts.length > 10000 && !excerpts.length) throw Error(`第 ${index} 条需要提取宣传资料中的原文卖点`);
  const videoFacts = excerpts.length ? excerpts.join('；') : facts;
  if (template?.format === 'timeline') return buildTimelineStory({ index, brand, facts, videoFacts, sceneId, duration, template, priorities, storyIdea, subjectId, draft });
  const dialogueA = clean(draft.dialogueA, 70);
  const dialogueB = clean(draft.dialogueB, 70);
  const adLine = clean(draft.adLine, 70);
  if (!dialogueA || !dialogueB || !adLine) throw new Error(`第 ${index} 条缺少三句对白`);
  if (![dialogueA, dialogueB, adLine].some(line => line.includes(brand))) throw new Error(`第 ${index} 条广告落点必须提到“${brand}”`);
  const title = clean(draft.title, 60) || `${scene.name}争执反转 ${index}`;
  const action = clean(draft.action, 500) || '甲先质疑，乙立即反驳，两人情绪短暂升高，最后由乙自然说出广告信息，甲的态度转为认可。';
  const prompt = [
    `生成一条完整 ${duration} 秒、9:16 竖屏、中文对白的写实短剧广告。标题：${title}。`,
    `${scene.direction}${scene.camera}`,
    `人物严格只有两名成年人。${action}`,
    `时间与对白必须在 ${duration} 秒内完整说完：0–${Math.round(duration*4/15)} 秒，人物甲说${quote(dialogueA)}；${Math.round(duration*4/15)}–${Math.round(duration*8/15)} 秒，人物乙回应${quote(dialogueB)}；${Math.round(duration*8/15)}–${duration-2} 秒，人物乙完成广告反转并说${quote(adLine)}；${duration-2}–${duration} 秒，两人用表情或简短动作收尾。`,
    template ? `选定模板：${template.name}。撰写规则：${template.rules}` : '',
    priorities ? `用户重点：${clean(priorities, 3000)}。只使用资料中可核实的信息。` : '',
    storyIdea ? `用户故事方向：${clean(storyIdea, 3000)}。保持选定模板的结构，不把虚构情节当成品牌事实。` : '',
    `甲方真实信息只允许来自以下资料：${videoFacts}。不得编造价格、收益、回购承诺、官方背书、资质或资料中没有的卖点。`,
    `“${brand}”必须通过人物口播自然出现一次，不能只靠画面小字；若画面出现品牌文字，只显示完整准确的“${brand}”。`,
    '对白清晰、口型与说话人对应，不抢话，不新增第三人旁白。争执只表现为语气和手势，不推搡、不打架、不辱骂，不出现危险动作。',
    '单一连续镜头，不跳场景、不换人、不换装；人物五官、双手和肢体结构稳定。保留低音量环境声，对白必须清楚可听，不添加盖过对白的音乐。'
  ].join('\n');
  return { id: randomUUID(), index, title, sceneId, sceneName: scene.name, brandName: brand, brief: videoFacts, dialogueA, dialogueB, adLine, action, prompt, duration, subjectId, templateId: template?.id, templateName: template?.name, priorities, storyIdea, promptVersion: 'story-ad-v2-flexible-dialogue' };
}

export async function draftStoryPromptBatch(input, provider) {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error('短剧提示词数量须为 1–30');
  const brandName = clean(input.brandName, 80), brief = clean(input.brief, 30000);
  const sceneId = STORY_SCENES[input.sceneId] ? input.sceneId : 'reenactment';
  if (!brandName || !brief) throw new Error('请填写甲方名称和宣传内容');
  if (!provider?.draftStoryPrompts) throw new Error('尚未配置短剧提示词模型');
  const duration = validateStoryDuration(input.duration ?? 15);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await provider.draftStoryPrompts({ count, brandName, brief, duration, template: input.template, selectedAssets: input.selectedAssets || [], referenceMode: input.referenceMode || 'text-only', priorities: input.priorities || '', storyIdea: input.storyIdea || '', sceneId, sceneName: STORY_SCENES[sceneId].name, retryInstruction: attempt > 1 ? '上一批结构不完整、故事重复或品牌落点错误。本次必须修正。' : '' });
      if (!Array.isArray(result?.items) || result.items.length !== count) throw new Error(`模型必须返回 ${count} 条短剧结构`);
      const items = result.items.map((draft, offset) => buildStoryPrompt({ index: offset + 1, brandName, brief, sceneId, duration, template: input.template, priorities: input.priorities, storyIdea: input.storyIdea, subjectId: input.subjectId, draft }));
      if (new Set(items.map(item => item.beats ? JSON.stringify(item.beats) : `${item.dialogueA}|${item.dialogueB}|${item.adLine}`)).size !== items.length) throw new Error('短剧对白出现重复');
      return { count, duration, sceneId, sceneName: STORY_SCENES[sceneId].name, items, attempts: attempt };
    } catch (error) { if(error.transient||error.status){throw new Error('短剧提示词接口请求失败：'+error.message,{cause:error});} lastError = error; }
  }
  throw new Error(`短剧提示词连续 3 次未通过校验：${lastError?.message || '未知错误'}`);
}

export function planStoryVideoJobs(input, routeInfo) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.length > 100) throw new Error('请先确认 1–100 条短剧提示词');
  if (!routeInfo?.configured) throw new Error('所选视频模型尚未配置');

  return items.map((item, offset) => {
    const duration = validateStoryDuration(item.duration ?? input.duration ?? 15);
    validateStoryRoute(routeInfo, duration, input.resolution);
    const imageIds = item.referenceImageIds || input.referenceImageIds || [];
    if (imageIds.length && (!(routeInfo.id.startsWith('wan-')||routeInfo.id==='doubao') || (item.referenceMode || input.referenceMode) !== 'reference-image')) throw Error('当前外观参考图流程请选择 Wan3 或豆包账号池');
    const prompt = clean(item.prompt, 50000);
    if (!prompt) throw new Error(`第 ${offset + 1} 条提示词为空`);
    return {
      id: randomUUID(), index: offset + 1, skillId: 'story-ad', skillName: clean(item.title, 80) || `${duration} 秒短剧 ${offset + 1}`,
      prompt, promptSections: { story: prompt }, lockedPrompt: true, referenceMode: item.referenceMode || input.referenceMode || 'text-only',
      referenceImageIds: item.referenceImageIds || input.referenceImageIds || [],
      videoRoute: routeInfo.id, videoModel: routeInfo.model, generationMethod: routeInfo.id === 'doubao' ? 'doubao' : 'apimart',
      duration, resolution: String(input.resolution || '480P').toUpperCase(), ratio: '9:16', seed: Math.floor(Math.random() * 2147483647),
      outputs: [], characters: [], choices: { subjectId: item.subjectId, templateId: item.templateId, sceneId: item.sceneId, brandName: item.brandName, promptVersion: item.promptVersion || 'story-ad-v1-15s-dialogue' }
    };
  });
}

export function validateStoryDuration(value) {
  const duration = Number(value);
  if (!Number.isInteger(duration) || (duration !== 10 && duration < 15) || duration > 30) throw Error('时长请选择 10 秒或 15–30 秒的整数');
  return duration;
}
export function validateStoryRoute(route, duration, resolution) {
  validateStoryDuration(duration);
  if (!route?.configured) throw Error('所选视频模型尚未配置');
  if(route.id==='doubao'&&![10,15].includes(duration))throw Error('豆包短剧请选择 10 秒或 15 秒');
  if(route.id!=='doubao'&&duration<15)throw Error('其他短剧模型请选择 15–30 秒');
  const limits = route.duration || {};
  if (duration < Number(limits.min || 1) || duration > Number(limits.max || 0) || (limits.values?.length && !limits.values.map(Number).includes(duration))) throw Error(`${route.name} 当前不支持 ${duration} 秒直出`);
  if (resolution && route.resolutions?.length && !route.resolutions.includes(String(resolution).toUpperCase())) throw Error('所选模型不支持此分辨率');
}

export function storyBeatCount(template, duration) {
  return template.strategyId === 'microdrama-ad-prompts' && duration >= 24 ? 6 : 4;
}

function buildTimelineStory({ index, brand, facts, videoFacts, sceneId, duration, template, priorities, storyIdea, subjectId, draft }) {
  const count = storyBeatCount(template, duration);
  if (!Array.isArray(draft.beats) || draft.beats.length !== count) throw Error(`第 ${index} 条需要 ${count} 段完整时间轴`);
  const characters = clean(draft.characters, 1200), scene = clean(draft.scene, 700);
  if (!characters || !scene) throw Error(`第 ${index} 条缺少人物或场景定义`);
  const beats = draft.beats.map((beat, i) => {
    const action = clean(beat.action, 1000), camera = clean(beat.camera, 400), dialogue = clean(beat.dialogue, 200), sound = clean(beat.sound, 300);
    if (!action || !camera) throw Error(`第 ${index} 条的第 ${i + 1} 段缺少动作或镜头`);
    return { start: Math.round(i * duration / count), end: Math.round((i + 1) * duration / count), action, camera, dialogue, sound };
  });
  if (!beats.at(-1).dialogue.includes(brand)) throw Error(`第 ${index} 条最后一段口播须提到“${brand}”`);
  const title = clean(draft.title, 60) || `${template.name} ${index}`;
  const prompt = [
    `【视频规格】完整 ${duration} 秒，9:16 竖屏，中文剧情推广视频。${title}。`,
    `【人物】${characters}。全片保持角色外貌、发型、服装、声音一致。`,
    `【场景】${scene}。镜头之间保留空间、时间与道具连续性。`,
    `【画质与光影】${clean(draft.visualStyle, 600) || '真实短剧质感，自然光影，人物与产品清晰。'}`,
    `【声音规范】中文对白准确同步口型，逐句由指定人物说出，不抢话；背景音乐：${clean(draft.music, 400) || '贴合情绪变化，低于人声，不压过对白'}；环境声：${clean(draft.sound, 300) || '符合场景的真实声音'}。`,
    `【本次写法】${template.name}。${template.rules}`,
    priorities ? `【用户重点】${clean(priorities, 3000)}` : '',
    storyIdea ? `【用户故事方向】${clean(storyIdea, 3000)}` : '',
    ...beats.map(b => `${b.start}–${b.end} 秒｜画面与动作：${b.action}；镜头：${b.camera}；${b.dialogue ? `中文对白：${b.dialogue}；` : '此段无人说话；'}环境音效：${b.sound || '保持场景环境声'}。`),
    `【品牌事实】本片只可使用以下真实资料：${videoFacts}。不能虚构价格、功效、收益、鉴定能力、资质、销量、用户评价、亲测经历或使用年限、优惠与背书。无实物外观资料时，不猜测精确包装和 Logo。故事是虚构演绎，不能冒充真实客户证言或新闻。`,
    '【质量约束】台词须在对应时间段内自然说完，不出现额外人物、换脸、错手、穿模、物品失真、字幕或 UI。动作和运镜简单，按时间顺序演出。'
  ].filter(Boolean).join('\n');
  if (prompt.length > 19000) throw Error(`第 ${index} 条提示词过长，请精简重点或故事方向`);
  return { id: randomUUID(), index, title, sceneId, sceneName: template.name, brandName: brand, brief: videoFacts, duration, subjectId, templateId: template.id, templateName: template.name, strategyId: template.strategyId, priorities, storyIdea, beats, characters, scene, prompt, promptVersion: 'story-ad-v3-timeline' };
}

export async function draftSelectedStoryPrompts(input, provider) {
  const count = Number(input.count), templates = input.templates || [input.template];
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error('总生成条数须为 1–100');
  if (!templates.length || templates.some(t => !t)) throw Error('请勾选模板');
  if (count < templates.length) throw Error('总条数不能少于勾选模板数，确保每个模板至少生成一条');
  const plans = templates.map((template, i) => ({ template, count: Math.floor(count / templates.length) + (i < count % templates.length ? 1 : 0) }));
  const chunks = plans.flatMap(plan => Array.from({ length: Math.ceil(plan.count / 5) }, (_, i) => ({ template: plan.template, count: Math.min(5, plan.count - i * 5) })));
  const results = new Array(chunks.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
    while (cursor < chunks.length) {
      const position = cursor++, chunk = chunks[position];
      results[position] = await draftStoryPromptBatch({ ...input, ...chunk, sceneId: chunk.template.sceneId }, provider);
    }
  }));
  const items = results.flatMap(result => result.items).map((item, index) => ({ ...item, index: index + 1, referenceMode: input.referenceMode || 'text-only', referenceImageIds: input.referenceImageIds || [], prompt: item.prompt + (input.selectedAssets?.length ? '\n【外观参考图】'+input.selectedAssets.map((a,i)=>`参考图${i+1}：${a.role}（${a.name}）`).join('；')+'。保持图中商品款式、材质、颜色、形状或门店与菜品真实外观，不替换成其他商品。图片只约束外观，不作为视频首帧，不固定人物姿势，不推测图片无法证明的功效、价格和资质。' : '') }));
  if (new Set(items.map(item => item.beats ? JSON.stringify(item.beats) : `${item.dialogueA}|${item.dialogueB}|${item.adLine}`)).size !== items.length) throw Error('批次出现重复故事，请重新生成提示词');
  return { count, duration: Number(input.duration), subjectSnapshot: { id: input.subjectId, name: input.brandName, materials: input.brief }, items, allocation: plans.map(p => ({ templateId: p.template.id, templateName: p.template.name, count: p.count })) };
}
