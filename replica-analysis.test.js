import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReplicaTemplate } from './replica-analysis.js';
test('复刻模型的非法节奏和未定义字段传回纠错，最终模板通过校验',async()=>{
  const calls=[],progress=[];const provider={analyzeReplica:async input=>{calls.push(input);if(calls.length===1)return{template:'固定场景',variables:[],beats:[{start:0,end:5,action:'走动'}]};if(calls.length===2)return{template:'{{beats[0].action}}',variables:[],beats:[]};return{template:'{{人物}}走动，共{{duration}}秒',variables:[{key:'人物',values:['成年女性']}],beats:[{start:0,end:1,action:'{{人物}}持续走动'}]};}};
  const result=await analyzeReplicaTemplate({duration:5},provider,p=>progress.push(p));assert.equal(result.beats[0].end,1);assert.equal(calls.length,3);assert.match(calls[1].repair.error,/0到1/);assert.match(calls[2].repair.error,/beats\[0\]/);assert.equal(progress.at(-1).analysisAttempt,3);
});
test('复刻格式修正有上限，网络故障立即结束，不自动重复模型请求',async()=>{
  let calls=0;await assert.rejects(()=>analyzeReplicaTemplate({}, {analyzeReplica:async()=>{calls++;throw Error('网络不可用');}}),/网络不可用/);assert.equal(calls,1);
  calls=0;await assert.rejects(()=>analyzeReplicaTemplate({}, {analyzeReplica:async()=>{calls++;return{template:'{{不存在}}'};}}),/未通过校验/);assert.equal(calls,3);
});
test('无效 JSON 同样进入格式修正，空结果不会丢失纠错上下文',async()=>{
  const calls=[];await analyzeReplicaTemplate({}, {analyzeReplica:async input=>{calls.push(input);if(calls.length===1){const error=Error('分析模型未返回有效JSON');error.invalidModelOutput=true;error.rawOutput='';throw error;}return{template:'固定场景中的自然动作',variables:[],beats:[]};}});assert.match(calls[1].repair.error,/JSON/);assert.equal(calls.length,2);
});
