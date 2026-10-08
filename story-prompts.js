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

export function buildStoryPrompt({ index = 1, brandName, brief, sceneId, draft = {} }) {
  const scene = STORY_SCENES[sceneId] || STORY_SCENES.reenactment;
  const brand = clean(brandName, 40);
  if (!brand) throw new Error('甲方名称不能为空');
  const facts = clean(brief, 1800);
  if (!facts) throw new Error('请填写甲方需要宣传的内容');
  const dialogueA = clean(draft.dialogueA, 70);
  const dialogueB = clean(draft.dialogueB, 70);
  const adLine = clean(draft.adLine, 70);
  if (!dialogueA || !dialogueB || !adLine) throw new Error(`第 ${index} 条缺少三句对白`);
  if (![dialogueA, dialogueB, adLine].some(line => line.includes(brand))) throw new Error(`第 ${index} 条广告落点必须提到“${brand}”`);
  const title = clean(draft.title, 60) || `${scene.name}争执反转 ${index}`;
  const action = clean(draft.action, 500) || '甲先质疑，乙立即反驳，两人情绪短暂升高，最后由乙自然说出广告信息，甲的态度转为认可。';
  const prompt = [
    `生成一条完整 15 秒、9:16 竖屏、中文对白的写实短剧广告。标题：${title}。`,
    `${scene.direction}${scene.camera}`,
    `人物严格只有两名成年人。${action}`,
    `时间与对白必须在 15 秒内完整说完：0–4 秒，人物甲说${quote(dialogueA)}；4–8 秒，人物乙回应${quote(dialogueB)}；8–13 秒，人物乙完成广告反转并说${quote(adLine)}；13–15 秒，两人用表情或简短动作收尾。`,
    `甲方真实信息只允许来自以下资料：${facts}。不得编造价格、收益、回购承诺、官方背书、资质或资料中没有的卖点。`,
    `“${brand}”必须通过人物口播自然出现一次，不能只靠画面小字；若画面出现品牌文字，只显示完整准确的“${brand}”。`,
    '对白清晰、口型与说话人对应，不抢话，不新增第三人旁白。争执只表现为语气和手势，不推搡、不打架、不辱骂，不出现危险动作。',
    '单一连续镜头，不跳场景、不换人、不换装；人物五官、双手和肢体结构稳定。保留低音量环境声，对白必须清楚可听，不添加盖过对白的音乐。'
  ].join('\n');
  return { id: randomUUID(), index, title, sceneId, sceneName: scene.name, brandName: brand, brief: facts, dialogueA, dialogueB, adLine, action, prompt, promptVersion: 'story-ad-v1-15s-dialogue' };
}

export async function draftStoryPromptBatch(input, provider) {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error('短剧提示词数量须为 1–30');
  const brandName = clean(input.brandName, 40), brief = clean(input.brief, 1800);
  const sceneId = STORY_SCENES[input.sceneId] ? input.sceneId : 'reenactment';
  if (!brandName || !brief) throw new Error('请填写甲方名称和宣传内容');
  if (!provider?.draftStoryPrompts) throw new Error('尚未配置短剧提示词模型');
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await provider.draftStoryPrompts({ count, brandName, brief, sceneId, sceneName: STORY_SCENES[sceneId].name, retryInstruction: attempt > 1 ? '上一批存在缺句、重复或广告落点未提甲方名称。本次必须修正。' : '' });
      if (!Array.isArray(result?.items) || result.items.length !== count) throw new Error(`模型必须返回 ${count} 条短剧结构`);
      const items = result.items.map((draft, offset) => buildStoryPrompt({ index: offset + 1, brandName, brief, sceneId, draft }));
      if (new Set(items.map(item => `${item.dialogueA}|${item.dialogueB}|${item.adLine}`)).size !== items.length) throw new Error('短剧对白出现重复');
      return { count, sceneId, sceneName: STORY_SCENES[sceneId].name, items, attempts: attempt };
    } catch (error) { lastError = error; }
  }
  throw new Error(`短剧提示词连续 3 次未通过校验：${lastError?.message || '未知错误'}`);
}

export function planStoryVideoJobs(input, routeInfo) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.length > 30) throw new Error('请先确认 1–30 条短剧提示词');
  if (!routeInfo?.configured) throw new Error('所选视频模型尚未配置');
  if (Number(routeInfo.duration?.max || 0) < 15) throw new Error(`${routeInfo.name} 当前不支持 15 秒直出`);
  return items.map((item, offset) => {
    const prompt = clean(item.prompt, 12000);
    if (!prompt || !/完整 15 秒/.test(prompt) || !/对白/.test(prompt)) throw new Error(`第 ${offset + 1} 条不是完整的 15 秒对白提示词`);
    return {
      id: randomUUID(), index: offset + 1, skillId: 'story-ad-15s', skillName: clean(item.title, 80) || `15 秒短剧 ${offset + 1}`,
      prompt, promptSections: { story: prompt }, lockedPrompt: true, referenceMode: 'text-only',
      videoRoute: routeInfo.id, videoModel: routeInfo.model, generationMethod: routeInfo.id === 'doubao' ? 'doubao' : 'apimart',
      duration: 15, resolution: String(input.resolution || '480P').toUpperCase(), ratio: '9:16', seed: Math.floor(Math.random() * 2147483647),
      outputs: [], characters: [], choices: { sceneId: item.sceneId, brandName: item.brandName, promptVersion: item.promptVersion || 'story-ad-v1-15s-dialogue' }
    };
  });
}
