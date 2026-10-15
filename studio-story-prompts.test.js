import test from 'node:test';
import assert from 'node:assert/strict';
import {storyPromptIssues,rewriteStudioPrompts} from './studio-story-prompts.js';

test('服务短剧拒绝把干净、日常放松扩写为症状或消毒承诺，保留否定边界',()=>{
 const facts='日常足部放松，使用干净毛巾';
 assert.deepEqual(storyPromptIssues('顾客脚踝微肿；展示已消毒毛巾；确认资料无误结束；请生成完整脚本。',facts),['微肿','已消毒','确认资料无误','请生成完整脚本']);
 assert.deepEqual(storyPromptIssues('不要展示肿胀，不新增已消毒承诺。顾客询问流程，护理师准备干净毛巾。',facts),[]);
 assert.deepEqual(storyPromptIssues('使用已消毒工具。','已消毒工具'),[]);
});
test('污染短剧自动重写一次，合格后才交给视频；持续失败明确拒绝',async()=>{
 const request={mode:'story',context:{brandFacts:'日常放松，干净毛巾'},items:[{id:'0',prompt:'15秒家庭日常护理'}]};let calls=0;
 const provider={rewritePrompts:async input=>{calls++;if(calls===1)return {items:[{id:'0',prompt:'展示已消毒毛巾'}]};assert.match(input.outputRequirements,/上一版/);assert.deepEqual(input.items,request.items);return {items:[{id:'0',prompt:'15秒，两位成年人，护理师准备干净毛巾，自然介绍流程。'}]};}};
 const result=await rewriteStudioPrompts(provider,request);assert.equal(calls,2);assert.match(result.items[0].prompt,/干净毛巾/);
 calls=0;await assert.rejects(rewriteStudioPrompts({rewritePrompts:async()=>{calls++;return {items:[{id:'0',prompt:'脚踝微肿'}]};}},request),/本次未提交视频/);assert.equal(calls,2);
});
