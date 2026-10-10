import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FEMALE_CLOTHES, FEMALE_WARDROBE_RULES } from './wardrobe-rules.js';
import { hasForbiddenAppearance, planPromptPairs } from './paired-prompts.js';
import { planPairedVideoJobs } from './paired-batches.js';
import { KeyframeBatchManager } from './keyframe-batches.js';
import { draftKeyframePromptBatch, hasOutOfRangeFemaleAge, validateReviewedPromptItems } from './prompt-batches.js';
import { TrialManager, buildFixedMassagePrompt } from './trials.js';
import { buildFlexibleVideoDirection } from './video-directions.js';

test('家庭模板只使用沙发或床并应用用户认可的服装库', () => {
  const pairs = planPromptPairs({ count: 24, variantKey: 'diversity-check', sceneMode: 'mixed', focusMode: 'mixed', footMode: 'mixed' });
  assert.equal(pairs.length, 24);
  assert.ok(pairs.every(x => ['sofa', 'bed'].includes(x.variation.home)));
  assert.ok(pairs.every(x => /用户认可的 30 套/.test(x.imagePrompt)));
  assert.ok(pairs.every(x => /用户认可的 30 套/.test(x.imagePrompt)));
  assert.ok(pairs.every(x => /伊趣舒心/.test(x.imagePrompt)));
  assert.ok(pairs.every(x => /禁止拼图/.test(x.imagePrompt)));
  assert.ok(pairs.every(x => /一个连续家庭空间和一位技师/.test(x.imagePrompt)));
  assert.ok(pairs.every(x => /配上优雅暧昧的音乐/.test(x.videoPrompt)));
  assert.ok(pairs.every(x => /22–32 岁/.test(x.imagePrompt)));
  assert.ok(pairs.every(x => ['action', 'balanced', 'beauty'].includes(x.variation.focus)));
  assert.ok(new Set(pairs.map(x => x.variation.shot)).size >= 3);
  assert.ok(new Set(pairs.map(x => x.variation.clothing)).size >= 4);
  assert.equal(new Set(pairs.slice(0, 3).map(x => `${x.variation.appearance}|${x.variation.clothing}|${x.variation.shot}`)).size, 3);
  assert.ok(pairs.every(x => Number.isInteger(x.seed) && x.seed >= 0 && x.seed <= 2147483647));
});

test('家庭按摩拒绝显式超龄女性', () => {
  assert.equal(hasOutOfRangeFemaleAge('28岁年轻成年亚洲女性'), false);
  assert.equal(hasOutOfRangeFemaleAge('36岁亚洲女性'), true);
  assert.equal(hasOutOfRangeFemaleAge('中年亚洲女性'), true);
});

test('审核后的提示词提交图片不再被年龄规则拦截', () => {
  const [pair] = planPromptPairs({ count: 1 });
  pair.identityKey = 'reviewed-person';
  pair.imagePrompt = pair.imagePrompt.replace('22–32 岁', '36 岁');
  assert.equal(validateReviewedPromptItems([pair])[0].imagePrompt, pair.imagePrompt);
});

test('提示词大模型返回超龄女性时整批拒绝', async () => {
  const provider = { draftKeyframePrompts: async () => ({ items: [{ appearance: '36岁亚洲女性，短发', clothing: '常规圆领连衣裙' }] }) };
  await assert.rejects(() => draftKeyframePromptBatch({ count: 1 }, provider), /年龄不在 22–32 岁/);
});

test('提示词大模型批次要求每个人物外貌唯一', async () => {
  const provider = { draftKeyframePrompts: async ({ count }) => ({ items: Array.from({ length: count }, (_, i) => ({
    appearance: `成年亚洲女性 ${i + 1}，${['鹅蛋脸低盘发', '圆脸披肩发', '瓜子脸高马尾'][i]}`,
    clothing: `${['高圆领黑色短袖配酒红及膝裙', '常规领墨绿中长裙', '米白高领上衣配深棕及膝裙'][i]}，不透明得体`
  })) }) };
  const result = await draftKeyframePromptBatch({ count: 3, variantKey: 'llm-prompts' }, provider);
  assert.equal(result.items.length, 3);
  assert.equal(new Set(result.items.map(x => x.identityKey)).size, 3);
  assert.ok(result.items.every(x => /用户认可的 30 套/.test(x.imagePrompt)));
  const duplicateProvider = { draftKeyframePrompts: async () => ({ items: [
    { appearance: '同一个成年女性，圆脸长发', clothing: '高圆领黑色短袖配及膝裙' },
    { appearance: '同一个成年女性，圆脸长发', clothing: '常规领墨绿色中长裙' }
  ] }) };
  await assert.rejects(() => draftKeyframePromptBatch({ count: 2 }, duplicateProvider), /人物与前文重复/);
});

test('服装检查允许新款式且不阻止低胸与制服搭配', () => {
  assert.equal(hasForbiddenAppearance('成年女性，常规圆领连衣裙，不穿工服或制服'), false);
  assert.equal(hasForbiddenAppearance('成年女性，高圆领上衣，无低胸设计'), false);
  assert.equal(hasForbiddenAppearance('成年女性，深 V 低胸制服'), false);
  for(const outfit of ['收腰接待制服裙','正面高领露背裙','露腰上装配包臀裙','立领旗袍','高腰百褶裙'])assert.equal(hasForbiddenAppearance('25岁成年女性，'+outfit),false);
});

test('脚部可以完整、局部或不露出，且人像重点可单独选择', () => {
  const mixed = planPromptPairs({ count: 40, variantKey: 'feet-mixed' });
  assert.ok(new Set(mixed.map(x => x.variation.foot)).has('hidden'));
  assert.ok(new Set(mixed.map(x => x.variation.foot)).has('visible'));
  const beauty = planPromptPairs({ count: 8, variantKey: 'beauty', focusMode: 'beauty' });
  assert.ok(beauty.every(x => x.variation.focus === 'beauty'));
});

test('固定首帧模式锁定足部按摩且不再使用走廊动作', async t => {
  const prompt = buildFixedMassagePrompt({ variantIndex: 2, userPrompt: '动作更轻缓' });
  assert.match(prompt, /持续为顾客按摩脚/);
  assert.match(prompt, /技师的面部和上半身/);
  assert.match(prompt, /伊趣舒心/);
  assert.doesNotMatch(prompt, /走廊|敲门|房卡/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fixed-massage-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const queue = {
    provider: { routes: [{ id: 'wan-tokendance', model: 'wan3.0-video' }] },
    state: { jobs: [] },
    enqueue(planned) {
      const batch = { id: `batch-${this.state.jobs.length + 1}` };
      this.state.jobs.push(...planned.map(job => ({ ...job, batchId: batch.id, status: 'queued', outputs: [] })));
      return batch;
    }
  };
  const references = {
    get: id => ({ id, analysisStatus: 'pending', sceneProfile: null }),
    source: id => `data:image/png;base64,${id}`,
    ensure: async id => `https://example.test/${id}.png`
  };
  const manager = new TrialManager(path.join(directory, 'trials.json'), queue, references);
  const trial = await manager.create({ workflow: 'fixed-massage', count: 3, referenceId: 'massage-frame', videoRoute: 'wan-tokendance', duration: 5 });
  assert.equal(trial.workflow, 'fixed-massage');
  assert.equal(trial.count, 3);
  assert.match(trial.trialJob.prompt, /足部按摩|按摩脚/);
  assert.equal(manager.items[0].remaining.length, 2);
});

test('一图一视频任务拒绝重复首帧', async () => {
  const references = { get: id => ({ id }), ensure: async id => `https://example.test/${id}.png`, source: id => `data:image/png;base64,${id}` };
  await assert.rejects(() => planPairedVideoJobs({ videoRoute: 'wan-tokendance', items: [
    { referenceId: 'same', videoPrompt: '按摩' }, { referenceId: 'same', videoPrompt: '按摩' }
  ] }, references), /同一张首帧只能生成一个视频/);
});

test('自由参考模式不把图片锁为首帧且每条镜头不同', async () => {
  const variation = { home: 'sofa', appearance: '成年亚洲女性，圆脸短发', clothing: '高圆领上衣配及膝裙', detail: '普通家用灯光' };
  const first = buildFlexibleVideoDirection({ index: 1, variation });
  const second = buildFlexibleVideoDirection({ index: 2, variation, itemPrompt: '人物背过去，改为按摩背部' });
  assert.notEqual(first.camera.id, second.camera.id);
  assert.match(second.prompt, /人工补充指令拥有最高优先级/);
  assert.match(second.prompt, /按摩背部/);
  assert.match(second.prompt, /不要继续套用默认足部按摩动作/);
  assert.match(first.prompt, /配上优雅暧昧的音乐/);
  assert.match(second.prompt, /无歌词纯音乐/);
  assert.match(first.prompt, /任何时刻至少一只手必须接触、承托或按摩顾客脚部/);
  assert.match(first.prompt, /禁止转身背离顾客/);
  assert.doesNotMatch(first.prompt, /身体略微背向镜头/);
  assert.match(second.prompt, /整段视频持续执行人工指定的服务动作/);
  assert.equal(first.promptVersion, 'home-massage-v3-contact-lock');
  const references = { get: id => ({ id }), ensure: async id => `https://example.test/${id}.png`, source: id => `data:image/png;base64,${id}` };
  const jobs = await planPairedVideoJobs({ videoRoute: 'wan-tokendance', items: [
    { referenceId: 'one', referenceMode: 'reference-image', videoPrompt: first.prompt, promptVersion: first.promptVersion, camera: first.camera, motion: first.motion },
    { referenceId: 'two', referenceMode: 'reference-image', videoPrompt: second.prompt, camera: second.camera, motion: second.motion }
  ] }, references);
  assert.ok(jobs.every(job => job.referenceImageUrl.startsWith('data:image/png')));
  assert.ok(jobs.every(job => job.referenceMode === 'reference-image'));
  assert.notEqual(jobs[0].prompt, jobs[1].prompt);
  assert.equal(jobs[0].choices.promptVersion, 'home-massage-v3-contact-lock');
  const legacySeedJob = await planPairedVideoJobs({ videoRoute: 'wan-aliyun', items: [
    { referenceId: 'legacy', referenceMode: 'reference-image', videoPrompt: first.prompt, seed: 3313443660 }
  ] }, references);
  assert.equal(legacySeedJob[0].seed, 1165960012);
});

test('首帧审核确认后才创建对应视频任务', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'keyframe-review-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let n = 0; const added = new Map(); const queued = [];
  const provider = {
    submitKeyframe: async () => ({ id: `image-task-${++n}`, status: 'waiting' }),
    keyframeStatus: async () => ({ status: 'complete', url: 'data:image/png;base64,iVBORw0KGgo=' })
  };
  const references = {
    addBuffer({ name }) { const id = `ref-${added.size + 1}`; added.set(id, { id, name }); return { id }; },
    get(id) { if (!added.has(id)) throw new Error('missing'); return added.get(id); },
    source(id) { return `data:image/png;base64,${id}`; }, ensure: async id => `https://example.test/${id}.png`
  };
  const queue = { enqueue(jobs) { queued.push(...jobs); return { id: 'video-batch-1', count: jobs.length }; } };
  const manager = new KeyframeBatchManager(path.join(directory, 'batches.json'), provider, references, queue, { maxSubmits: 3, maxPolls: 3 });
  const created = manager.create({ count: 2, variantKey: 'review-test' });
  await new Promise(resolve => setTimeout(resolve, 20));
  for (const item of manager.find(created.id).items) item.nextAt = 0;
  const completed = await manager.refresh(created.id);
  assert.equal(completed.progress.complete, 2);
  assert.equal(queued.length, 0);
  const result = await manager.confirm(created.id, { itemIds: [completed.items[0].id], videoRoute: 'wan-tokendance', videoModel: 'test', itemDirections: { [completed.items[0].id]: '人物背向镜头，按摩背部' } });
  assert.equal(result.videoBatch.count, 1);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].referenceId, completed.items[0].resultReferenceId);
  assert.match(queued[0].referenceImageUrl, /^data:image\/png/);
  assert.equal(queued[0].referenceMode, 'reference-image');
  assert.match(queued[0].prompt, /按摩背部/);
  assert.match(queued[0].prompt, /配上优雅暧昧的音乐/);
});

 test('30 套指定服装均可通过提示词生成检查和图片提交', async () => {
  assert.equal(FEMALE_CLOTHES.length, 30);
  assert.match(FEMALE_WARDROBE_RULES, /明确成年女性/);
  const provider = { draftKeyframePrompts: async () => ({items:FEMALE_CLOTHES.map((clothing,i)=>({appearance:`25岁成年亚洲女性，人物造型 ${i}`,clothing}))}) };
  const result = await draftKeyframePromptBatch({count:30},provider);
  assert.equal(validateReviewedPromptItems(result.items).length,30);
  for(const item of result.items)assert.doesNotMatch(item.imagePrompt,/禁止低胸|不穿工服或制服/);
 });
