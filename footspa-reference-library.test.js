import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FOOTSPA_REFERENCE_CATALOG as catalog,footspaReferences,footspaReferenceFile,footspaActionPrompt} from './footspa-reference-library.js';
import {loadActionTemplates,compatibility} from './action-templates.js';
import {StudioImages} from './studio-images.js';
import {StudioService} from './studio-service.js';

test('参考目录只绑定已核实来源，缺媒体和缺来源分别表示，不泄露本地路径',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'footspa-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(catalog.sources.length,18);assert.equal(catalog.clips.length,17);
 assert.equal(catalog.clips.filter(c=>!c.sourceId).length,0);
 for(const s of catalog.sources){const u=new URL(s.url);assert.equal(u.protocol,'https:');assert.equal(u.search,'');}
 for(const c of catalog.clips)assert.ok(c.actionIds.every(id=>loadActionTemplates().some(a=>a.id===id)));
 assert.equal(footspaReferences(root).every(c=>c.source),true);
 const external=footspaReferences(root).find(c=>c.source);assert.equal(external.status,'external');
 fs.mkdirSync(path.join(root,'data','footspa-references'),{recursive:true});fs.writeFileSync(path.join(root,'data','footspa-references',external.id+'.mp4'),'test');
 assert.equal(footspaReferences(root).find(c=>c.id===external.id).status,'local');assert.ok(footspaReferenceFile(root,external.id,'video'));
 assert.equal(footspaReferenceFile(root,'../../private','video'),null);assert.equal(footspaReferenceFile(root,external.id,'private'),null);
 assert.equal(footspaReferences(root,'action-06').length,0);
});
test('人物图选填且合成首帧实际携带门店与人物附件，不拿人物肖像当背景',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'footspa-identity-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const action=loadActionTemplates().find(a=>a.id==='action-16');
 const p={id:'p',scene:'footspa',commonImageId:'scene',materials:{personImageIds:['face']},plans:[{id:'plan',templateId:'footspa:action-16',imageIds:['scene'],snapshot:{packId:'foot-spa-store',actionId:action.id,actionTemplate:action,people:'2位成年人',description:action.actionText}}]};
 const service={domain:{project:()=>p},provider:{keyframeConfigured:true},references:{get:id=>({id})}};
 const images=new StudioImages(path.join(dir,'images.json'),service);images.pump=()=>{};t.after(()=>clearInterval(images.timer));
 const task=images.create({projectId:'p',planId:'plan',count:1});
 assert.deepEqual(task.items[0].referenceIds,['scene','face']);assert.ok(task.items[0].prompt.includes(action.startPose));assert.ok(task.items[0].prompt.includes('不能把肖像当作背景'));
 p.materials.personImageIds=[];
 assert.deepEqual(images.create({projectId:'p',planId:'plan',count:1}).items[0].referenceIds,['scene']);
 assert.match(task.items[0].prompt,/45 度/);assert.match(task.items[0].prompt,/通道01/);assert.match(task.items[0].prompt,/不要电影感/);assert.doesNotMatch(task.items[0].prompt,/不添加假时间戳/);
});
test('制作台批量提示词实际使用参考动作规则，时长、核心动作和结尾传到改写模型',async()=>{
 const action=loadActionTemplates().find(a=>a.id==='action-16');let input;
 const plan={id:'plan',count:2,duration:6,ratio:'9:16',signature:'same',imageIds:[],snapshot:{packId:'foot-spa-store',actionTemplate:action,actions:[action.actionText],description:action.actionText,people:'2位成年人'}};
 const p={id:'p',scene:'footspa',plans:[plan],materials:{personImageIds:[]}};
 const service={domain:{project:()=>p,save:()=>{},readiness:()=>({errors:[]}),adopted:()=>[]},queue:{},provider:{routes:[],rewritePrompts:async v=>{input=v;return {items:v.items};}},references:{get:()=>({})}};
 service.project=id=>p;
 await StudioService.prototype.generate.call(service,'p');
 assert.equal(input.items.length,2);assert.ok(input.items.every(i=>i.prompt.includes(action.actionText)&&i.prompt.includes(action.endState)&&i.prompt.includes('6秒')));assert.ok(input.context.requirements.includes('进入顺序'));
 assert.equal(plan.prompts.length,2);assert.equal(plan.promptsDirty,false);
});
test('各动作可生成5到8秒提示词，保留进入顺序、人数、结束状态与可选人物身份',()=>{
 for(const action of loadActionTemplates())for(const duration of [5,6,8]){
  const prompt=footspaActionPrompt(action,{duration});assert.ok(prompt.includes(action.actionText));assert.ok(prompt.includes(action.endState));assert.ok(prompt.includes(`${duration}秒`));assert.equal((prompt.match(/人物\d+：/g)||[]).length,action.people);
  assert.ok(prompt.includes('未提供人物图'));assert.ok(footspaActionPrompt(action,{personImages:true}).includes('锁定对应成年人物身份'));
 }
 assert.throws(()=>footspaActionPrompt(loadActionTemplates()[0],{duration:NaN}),/时长/);
 const stairs=loadActionTemplates().find(a=>a.id==='action-20');assert.equal(compatibility(stairs,{sceneTags:['corridor','clear_walkway'],maxPeople:2}).compatible,false);
});
