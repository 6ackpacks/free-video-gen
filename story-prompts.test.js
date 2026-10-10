import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryPrompt, draftStoryPromptBatch, draftSelectedStoryPrompts, planStoryVideoJobs, validateStoryDuration, storyBeatCount } from './story-prompts.js';
import { STORY_TEMPLATES, STORY_STRATEGIES } from './story-library.js';

const draft = { title: '旧金争执', dialogueA: '你这旧首饰还能怎么处理？', dialogueB: '先别急着随便卖。', adLine: '去人民金行了解专业服务。', action: '甲拿着旧首饰质疑，乙解释后指向品牌资料。' };

test('15 秒短剧锁定两人对白、甲方事实与三种场景', () => {
  for (const sceneId of ['reenactment', 'ktv', 'surveillance']) {
    const item = buildStoryPrompt({ brandName: '人民金行', brief: '提供旧金饰咨询服务', sceneId, draft });
    assert.match(item.prompt, /完整 15 秒/);
    assert.match(item.prompt, /人物严格只有两名成年人/);
    assert.match(item.prompt, /人民金行/);
    assert.match(item.prompt, /不得编造价格、收益、回购承诺/);
  }
});

test('短剧提示词批次校验条数、品牌落点与去重', async () => {
  const provider = { draftStoryPrompts: async () => ({ items: [draft, { ...draft, title: '第二条', dialogueA: '你确定这样处理合适吗？', dialogueB: '应该先问清楚服务。', adLine: '人民金行可以提供相关咨询。' }] }) };
  const result = await draftStoryPromptBatch({ count: 2, brandName: '人民金行', brief: '提供旧金饰咨询服务', sceneId: 'ktv' }, provider);
  assert.equal(result.items.length, 2);
  assert.notEqual(result.items[0].prompt, result.items[1].prompt);
});

test('15 秒直出拒绝不支持时长的模型', () => {
  const item = buildStoryPrompt({ brandName: '人民金行', brief: '提供旧金饰咨询服务', sceneId: 'reenactment', draft });
  assert.throws(() => planStoryVideoJobs({ items: [item] }, { id: 'short', name: '短模型', model: 'x', configured: true, duration: { max: 6 } }), /不支持 15 秒/);
  const jobs = planStoryVideoJobs({ items: [item], resolution: '480P' }, { id: 'wan-aliyun', name: 'Wan', model: 'wan3.0-video', configured: true, duration: { max: 30 } });
  assert.equal(jobs[0].duration, 15);
  assert.equal(jobs[0].referenceMode, 'text-only');
});

test('30 秒写法保留知识库全文与用户方向，视频任务时长一致', async () => {
  let received;
  const brief = '完整资料'.repeat(600);
  const template = { id: 'legacy-ktv', name: '测试模板', rules: '聚焦服务流程' };
  const result = await draftStoryPromptBatch({ count: 1, brandName: '人民金行', brief, duration: 30, template, priorities: '咨询流程', storyIdea: '朋友解释', subjectId: 'subject-1', sceneId: 'ktv' }, {
    draftStoryPrompts: async input => { received = input; return { items: [draft] }; }
  });
  assert.equal(received.duration, 30);
  assert.equal(received.brief, brief);
  assert.equal(received.template.rules, '聚焦服务流程');
  assert.match(result.items[0].prompt, /完整 30 秒/);
  assert.match(result.items[0].prompt, /28–30 秒/);
  assert.match(result.items[0].prompt, /用户重点：咨询流程/);
  assert.match(result.items[0].prompt, /用户故事方向：朋友解释/);
  assert.equal(result.items[0].subjectId, 'subject-1');
  const route = { id: 'wan-aliyun', name: 'Wan', configured: true, model: 'wan3.0-video', duration: { min: 2, max: 30 }, resolutions: ['720P'] };
  assert.equal(planStoryVideoJobs({ items: result.items, resolution: '720P' }, route)[0].duration, 30);
  assert.throws(() => planStoryVideoJobs({ items: result.items, resolution: '720P' }, { ...route, duration: { max: 20 } }), /不支持 30 秒/);
  for (const value of [14, 31, 15.5, 'invalid']) assert.throws(() => validateStoryDuration(value));
});

test('三套新 skill 使用各自时间轴，不被旧版两人三句限制；批次按总数分配并发不超三路', async () => {
  const templates = ['micro-2', 'emotion-family', 'reversal-5'].map(id => STORY_TEMPLATES.find(t => t.id === id));
  const calls = [];
  let active = 0, peak = 0, sequence = 0;
  const provider = { draftStoryPrompts: async input => {
    active++; peak = Math.max(peak, active); calls.push(input);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return { items: Array.from({ length: input.count }, () => ({
      title: '故事' + ++sequence, characters: '甲成年女，黑色长发；乙成年男，黑色短发', scene: '门店柜台', music: '轻柔温暖钢琴', factsUsed: ['提供咨询服务'],
      beats: Array.from({ length: storyBeatCount(input.template, input.duration) }, (_, i) => ({ action: `独立动作 ${sequence} ${i}`, camera: '缓慢推近', dialogue: i === storyBeatCount(input.template, input.duration) - 1 ? '甲：人民金行提供咨询服务。' : '', sound: '环境低声' }))
    })) };
  } };
  const result = await draftSelectedStoryPrompts({ count: 8, duration: 30, brandName: '人民金行', brief: '提供咨询服务', templates, subjectId: 'test' }, provider);
  assert.equal(result.items.length, 8);
  assert.deepEqual(result.allocation.map(a => a.count), [3, 3, 2]);
  assert.equal(peak, 3);
  assert.equal(calls[0].template.strategyId, 'microdrama-ad-prompts');
  assert.equal(result.items[0].beats.length, 6);
  assert.equal(result.items[3].beats.length, 4);
  for (const item of result.items) {
    assert.equal(item.beats.at(-1).end, 30);
    assert.match(item.prompt, /背景音乐/);
    assert.doesNotMatch(item.prompt, /人物严格只有两名成年人/);
  }
  assert.equal(storyBeatCount(templates[0], 15), 4);
  assert.equal(result.subjectSnapshot.materials, '提供咨询服务');
  await assert.rejects(() => draftSelectedStoryPrompts({ count: 2, templates }, provider), /不能少于/);
  assert.ok(!STORY_STRATEGIES.some(s => s.id === 'ai-drama-sales-video'));
});


test('短剧提示词网络错误立即退出，不误报为结构校验失败或重复请求', async()=>{
  let calls=0;
  const provider={draftStoryPrompts:async()=>{calls++;const error=Error('APIMart 代理连接被拒绝');error.transient=true;throw error;}};
  await assert.rejects(()=>draftStoryPromptBatch({count:1,brandName:'人民金行',brief:'提供首饰咨询服务',duration:15},provider),/接口请求失败：APIMart 代理连接被拒绝/);
  assert.equal(calls,1);
});


test('豆包短剧支持 10/15 秒并保持每张图片的资源 ID，不放行更长任务',()=>{
 const route={id:'doubao',name:'豆包账号池',configured:true,model:'seedance_v2.0_mini',duration:{min:5,max:15,values:[5,10,15]},resolutions:['由豆包决定']};
 for(const duration of [10,15]){
  const item=buildStoryPrompt({brandName:'人民金行',brief:'首饰咨询',duration,draft});
  const jobs=planStoryVideoJobs({items:[{...item,referenceMode:'reference-image',referenceImageIds:['jpg-id','png-id']}],resolution:'由豆包决定'},route);
  assert.equal(jobs[0].duration,duration);assert.equal(jobs[0].generationMethod,'doubao');assert.deepEqual(jobs[0].referenceImageIds,['jpg-id','png-id']);
 }
 assert.throws(()=>planStoryVideoJobs({items:[{prompt:'test',duration:30}]},route),/10 秒或 15 秒/);
});
