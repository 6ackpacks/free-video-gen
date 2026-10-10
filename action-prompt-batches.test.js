import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { draftActionPromptBatch } from './action-prompt-batches.js';
import { actionPromptRules, parseActionDraft } from './prompt-guidance.js';
import { TrialManager } from './trials.js';

const scene = { description: '真实走廊，两侧房门可见，通道连续。', sceneTags: ['corridor','visible_door','clear_walkway'], maxPeople: 3 };
const references = { get: () => ({id:'base',analysisStatus:'complete',sceneProfile:scene}), ensure: async () => { await new Promise(resolve=>setImmediate(resolve));return 'https://example.invalid/base.jpg'; } };
const input = {referenceId:'base',packId:'foot-spa-store',actionId:'action-02',actionMode:'manual',duration:5,count:5};
function output(job) { return parseActionDraft(JSON.stringify({prompt:`第 ${job.index} 条：固定高位视角的真实走廊，成年女技师走在成年男客人前半步，两人沿真实通道自然远离镜头。技师轻轻回头点头，然后继续向走廊深处行走，末尾两人仍在走动。画面低对比、雾感、轻微模糊，带噪点与压缩痕迹。配舒缓无歌词纯音乐，没有可听见的人声。`,characters:actionPromptRules(job).relationships.map(role=>({role,appearance:'成年亚洲人物',clothing:'普通休闲服'}))}),job); }
test('选 5 条得到 5 条完整提示词，想法可留空，进度可恢复，失败只影响该条',async()=>{
  let active=0,peak=0;const progress=[];
  const provider={promptModel:'test',draft:async job=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return output(job);}};
  const result=await draftActionPromptBatch(input,provider,references,value=>progress.push(value));
  assert.equal(result.items.length,5);assert.equal(new Set(result.items.map(i=>i.prompt)).size,5);assert.equal(progress.at(-1).completed,5);assert.ok(peak<=3);
  for(const item of result.items)assert.ok(item.selected&&item.contextKey&&item.characters.length===2);
  provider.draft=async job=>{if(job.index===2)throw Error('单条请求失败');return output(job);};
  const partly=await draftActionPromptBatch({...input,creativeBrief:'走慢一点'},provider,references);
  assert.equal(partly.items[1].selected,false);assert.equal(partly.items[1].error,'单条请求失败');assert.equal(partly.items.filter(i=>i.prompt).length,4);
  await assert.rejects(()=>draftActionPromptBatch({...input,count:0},provider,references),/数量/);
});
test('勾选子集直接提交全部已编辑全文，未选条目不入队，重复与并发确认不重复生成',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'selected-prompt-batch-'));
  try {
    const drafted=await draftActionPromptBatch(input,{promptModel:'test',draft:async job=>output(job)},references);
    const chosen=[drafted.items[1],{...drafted.items[3],prompt:drafted.items[3].prompt+' 用户修改过末尾措辞。'}];
    let enqueues=0;
    const queue={provider:{promptModel:'test'},state:{jobs:[]},enqueue(items){enqueues++;this.state.jobs.push(...items.map(j=>({...j,batchId:'chosen',status:'queued',outputs:[]})));return{id:'chosen'};}};
    const manager=new TrialManager(path.join(dir,'trials.json'),queue,references);
    const payload={...input,count:2,requestId:'review-1',preparedPrompts:chosen};
    const [batch,duplicate]=await Promise.all([manager.create(payload),manager.create(payload)]);
    assert.equal(batch.id,duplicate.id);assert.equal(enqueues,1);assert.equal(batch.jobs.length,2);assert.equal(batch.submissionMode,'selected-prompts');assert.equal(manager.items[0].remaining.length,0);
    assert.deepEqual(queue.state.jobs.map(j=>j.prompt),chosen.map(i=>i.prompt));assert.ok(queue.state.jobs.every(j=>j.lockedPrompt&&j.status==='queued'));
    assert.deepEqual(queue.state.jobs.map(j=>j.promptDraftId),chosen.map(i=>i.id));
    await manager.create(payload);assert.equal(enqueues,1);
    await assert.rejects(()=>manager.create({...payload,requestId:'stale',duration:10}),/已变化/);assert.equal(enqueues,1);
    const restored=new TrialManager(path.join(dir,'trials.json'),queue,references);assert.equal(restored.get(batch.id).jobs.length,2);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
