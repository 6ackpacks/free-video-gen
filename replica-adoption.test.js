import test from 'node:test';
import assert from 'node:assert/strict';
import {planReplicaSubmission} from './replica-adoption.js';

test('旧复刻入口采纳试片后五条只补四条，设置或动作包改变拒绝复用',()=>{
  const input={replica:{template:'主体展示'},count:1,trial:true,duration:5,videoRoute:'doubao',referenceImageIds:['image'],actionPack:{actions:['旋转展示']}};
  const trial=planReplicaSubmission(input,{prompts:[{id:'trial',index:1}]},[]).prompts[0];
  trial.status='complete';
  const bulk={...input,count:5,trial:false,adoptedTrialId:trial.id};
  const planned={prompts:Array.from({length:5},(_,i)=>({index:i+1}))};
  const result=planReplicaSubmission(bulk,planned,[trial]);
  assert.deepEqual(result.prompts.map(j=>j.index),[2,3,4,5]);
  assert.throws(()=>planReplicaSubmission({...bulk,duration:10},planned,[trial]),/失效/);
  assert.throws(()=>planReplicaSubmission({...bulk,actionPack:{actions:['开箱']}},planned,[trial]),/失效/);
  assert.throws(()=>planReplicaSubmission({...bulk,adoptedTrialId:'other'},planned,[trial]),/失效/);
  assert.equal(planReplicaSubmission({...bulk,adoptedTrialId:''},planned,[trial]).prompts.length,5);
});
