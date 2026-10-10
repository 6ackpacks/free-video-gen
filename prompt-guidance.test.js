import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { templatesWithCompatibility } from './action-templates.js';
import { actionContextKey, actionPromptRules, parseActionDraft, parseRewrites, rewriteMessages } from './prompt-guidance.js';
import { createProvider } from './apimart.js';
import { TrialManager } from './trials.js';
import { draftKeyframePromptBatch } from './prompt-batches.js';
import { draftStoryPromptBatch } from './story-prompts.js';

const scene = { description: '真实走廊，两侧房门可见，通道连续。', sceneTags: ['corridor','visible_door','clear_walkway'], maxPeople: 3 };
const template = templatesWithCompatibility(scene).find(t => t.id === 'action-02');
const job = { referenceId: 'base', sceneProfile: scene, actionTemplate: template, duration: 5, ratio: '9:16', creativeBrief: '停顿自然一点', outputRequirements: '用一段完整文字', outputLanguage: 'zh' };
const prompt = '固定高位镜头下，一位成年女技师与成年男客人沿真实走廊向前走。技师轻转头与客人交流，步速舒缓，客人点头回应，两人继续沿原走廊前行。保持底图透视与物件位置，画面轻微模糊、低对比，带噪点和压缩痕迹；配舒缓无歌词纯音乐，无可听见的人声。';
const characters = actionPromptRules(job).relationships.map(role => ({ role, appearance: '成年亚洲人物，短发', clothing: '普通休闲服' }));
test('模型撰写整条提示词，保留原结果，不再注入固定动作正文', async () => {
  let captured;
  const provider = createProvider({ apiKey: 'test-only', chatProvider: { promptModel: 'test-model', requestChat: async payload => { captured = payload; return { choices: [{ message: { content: JSON.stringify({ prompt, characters }) } }] }; } } });
  const result = await provider.draft(job);
  assert.equal(result.prompt, prompt);
  assert.equal(result.prompt.includes(template.actionText), false);
  assert.equal(result.promptSource, 'llm-template-skill');
  assert.equal(result.contextKey, actionContextKey(job));
  assert.ok(captured.messages.some(m => m.content.includes('足浴店限制 skill')));
  const input = JSON.parse(captured.messages.at(-1).content);
  assert.equal(input.inputs.creativeBrief, job.creativeBrief);
  assert.equal(input.inputs.outputRequirements, job.outputRequirements);
  assert.equal(input.templateGuide, template.actionText);
  assert.throws(() => parseActionDraft(JSON.stringify({ prompt, characters: [] }), job), /人物数量/);
  assert.notEqual(actionContextKey({ ...job, creativeBrief: '快一点' }), result.contextKey);
  assert.equal(actionContextKey({ ...job, userPrompt: '  补充  ' }), actionContextKey({ ...job, userPrompt: '补充' }));
});
test('审核过的可编辑全文只用于首条，后续仍各自调用模型以产生变化', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-skill-review-'));
  try {
    const queue = { provider: { promptModel: 'test' }, state: { jobs: [] }, enqueue(items) { this.state.jobs.push(...items.map(j=>({...j,batchId:'trial',status:'draft_pending',outputs:[]})));return { id:'trial' }; } };
    const refs = { get: () => ({ id:'base',analysisStatus:'complete',sceneProfile:scene }), ensure: async () => 'https://example.invalid/base.jpg' };
    const manager = new TrialManager(path.join(dir,'trials.json'),queue,refs);
    const prepared = parseActionDraft(JSON.stringify({ prompt, characters }), job);
    await manager.create({ count:3,referenceId:'base',actionMode:'manual',actionId:template.id,duration:5,...job,preparedPrompt:prepared });
    assert.equal(queue.state.jobs[0].prompt,prompt);
    assert.equal(queue.state.jobs[0].lockedPrompt,true);
    for(const item of manager.items[0].remaining){assert.equal(item.prompt,'');assert.equal(item.lockedPrompt,false);assert.equal(item.draftAnchor,prompt);}
    await assert.rejects(()=>manager.create({ count:1,...job,actionId:template.id,preparedPrompt:prepared,outputRequirements:'更简短' }),/已变化/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('各内容页改写保留条目映射和复刻变量，拒绝错条数或丢变量', () => {
  for(const mode of ['store','paired','story','replica']) {
    const input={mode,creativeBrief:'更自然',items:[{id:'a',prompt:'{{人物}}走入{{场景}}，{{duration}}秒'}]};
    assert.ok(rewriteMessages(input).at(-1).content.includes('更自然'));
    assert.equal(parseRewrites(JSON.stringify({items:input.items}),input).items[0].id,'a');
    assert.throws(()=>parseRewrites('{"items":[]}',input),/条数/);
    assert.throws(()=>parseRewrites('{"items":[{"id":"b","prompt":"wrong"}]}',input),/格式/);
    if(mode==='replica')assert.throws(()=>parseRewrites('{"items":[{"id":"a","prompt":"{{人物}}走路"}]}',input),/变量/);
  }
});
test('家庭与短剧的输出要求作用于最终全文，改写请求失败不会重复整批模型调用', async () => {
  let draftCalls = 0, rewriteCalls = 0;
  const pairedProvider = {
    draftKeyframePrompts: async () => { draftCalls++; return { items: [{ appearance: '25岁年轻成年亚洲女性，黑色长发，鹅蛋脸', clothing: '蓝色修身长裙' }] }; },
    rewritePrompts: async input => { rewriteCalls++; assert.equal(input.outputRequirements,'一段英文'); assert.equal(input.items.length,2); return { items: input.items.map(item=>({...item,prompt:'Rewritten '+item.id})) }; }
  };
  const input = { count:1,creativeBrief:'自然一点',outputRequirements:'一段英文',outputLanguage:'en' };
  const paired = await draftKeyframePromptBatch(input,pairedProvider);
  assert.match(paired.items[0].imagePrompt,/^Rewritten /);
  assert.match(paired.items[0].videoPrompt,/^Rewritten /);
  assert.equal(draftCalls,1); assert.equal(rewriteCalls,1);
  pairedProvider.rewritePrompts = async () => { throw Error('network failed'); };
  await assert.rejects(()=>draftKeyframePromptBatch(input,pairedProvider),/network failed/);
  assert.equal(draftCalls,2);
  const story = await draftStoryPromptBatch({count:1,brandName:'人民金行',brief:'提供旧金饰咨询服务',outputRequirements:'一段完整文字'}, {
    draftStoryPrompts: async () => ({ items:[{title:'旧金饰咨询',dialogueA:'先了解一下可以吗？',dialogueB:'先问清楚服务。',adLine:'人民金行提供旧金饰咨询服务。',action:'两位成年人自然交流',factsUsed:['提供旧金饰咨询服务']}] }),
    rewritePrompts: async request => { assert.equal(request.mode,'story'); return {items:request.items.map(item=>({...item,prompt:'用户指定的一段完整提示词'}))}; }
  });
  assert.equal(story.items[0].prompt,'用户指定的一段完整提示词');
});
