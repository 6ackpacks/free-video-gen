import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryPrompt, draftStoryPromptBatch, planStoryVideoJobs } from './story-prompts.js';

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
