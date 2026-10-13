import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {creativeInputs,creativePrompt,creativeErrors} from './studio-creative-inputs.js';
import {StudioDomain} from './studio-domain.js';
import {catalogSeeds,buildCatalog} from './studio-catalog.js';
import {StudioService} from './studio-service.js';
import {StudioImages} from './studio-images.js';
import {createAvatarProvider} from './wan-avatar.js';
const refs={get(id){if(!['product','person','scene','frame'].includes(id))throw Error('missing');return {id};},ensure:async id=>'https://assets.example/'+id+'.png'};
test('产品人物场景与口播保存重启，修改卖点使草稿失效；素材进入真实视频任务',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'creative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'studio.json'),domain=new StudioDomain(file,catalogSeeds());
 const type=buildCatalog(domain.state.templates).templateTypes.find(v=>v.id==='jewelry:avatar-talk'),template=domain.template(type.actionIds[0]);
 const input={templateTypeId:type.id,industryId:'jewelry',scene:'jewelry',materials:{productImageIds:['product'],personImageIds:['person'],sceneImageIds:['scene']},productBrief:{name:'项链',sellingPoints:'银色外观',script:'这是我们的银色项链。'},plans:[{templateId:template.id,count:1,duration:10,videoRoute:'wan-tokendance',resolution:'720P',ratio:'9:16',referenceMode:'reference-image',mapping:'common',imageIds:['frame']}]};
 const p=domain.saveProject(input);p.plans[0].prompts=['已确认口播'];p.plans[0].promptsDirty=false;domain.save();
 const restored=new StudioDomain(file);assert.equal(restored.project(p.id).productBrief.script,input.productBrief.script);
 restored.saveProject({id:p.id,productBrief:{...p.productBrief,sellingPoints:'银色项链，真实包装'},plans:p.plans});assert.ok(restored.project(p.id).plans[0].promptsDirty);
 const service=Object.create(StudioService.prototype);Object.assign(service,{domain:restored,references:refs});const job=service.jobs(restored.project(p.id))[0];assert.deepEqual(job.referenceImageIds,['frame','product','person','scene']);assert.equal(job.nativeAudio,true);
 assert.match(creativePrompt(p),/这是我们的银色项链/);assert.ok(!creativeErrors(p,refs,[{id:'wan-tokendance',nativeAudio:true}]).length);
 assert.ok(creativeErrors({...p,materials:{}},refs,[]).includes('请添加真实产品图'));
});
test('按摩专属类型保留护理动作，不与通用商品展示混合',()=>{
 const templates=[...catalogSeeds(),{id:'massage:care1',name:'肩颈护理',scene:'massage',source:'builtin'}].map(t=>({...t,source:'builtin'}));const catalog=buildCatalog(templates);
 const special=catalog.templateGroups.find(g=>g.id==='massage:service');assert.ok(special.special);assert.equal(special.categoryId,'massage-care');assert.deepEqual(special.industryIds,['massage']);
 const general=catalog.templateTypes.find(t=>t.id==='massage:product-service');assert.equal(general.categoryId,'service');assert.ok(!general.actionIds.includes('massage:care1'));
});
test('关键帧实际提交产品、人物和场景三类参考，保持比例，拒绝无产品图',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'creative-images-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let captured;
 const p={id:'p',scene:'jewelry',templateTypeId:'jewelry:avatar-talk',materials:{productImageIds:['product'],personImageIds:['person'],sceneImageIds:['scene']},productBrief:{name:'产品',script:'口播'},plans:[{id:'plan',templateId:'t',ratio:'16:9',snapshot:{name:'口播',imageRules:'保留外观',description:'人物持产品',people:'成年人'},creativeBrief:''}]};
 const service={domain:{project:()=>p},provider:{keyframeConfigured:true,submitKeyframe:async(prompt,options)=>{captured={prompt,options};return {id:'external'};}},references:refs};const images=new StudioImages(path.join(root,'images.json'),service);t.after(()=>clearInterval(images.timer));
 const task=images.create({projectId:'p',planId:'plan',count:1,requestId:'once'});await new Promise(r=>setTimeout(r,20));assert.ok(captured.prompt.includes('16:9'));assert.equal(captured.options.referenceUrls.length,3);assert.equal(task.items[0].providerId,'external');
 p.materials={};assert.throws(()=>images.create({projectId:'p',planId:'plan',count:1,requestId:'second'}),/产品图/);
});
test('专用对口型适配器发送图片和真实音频，识别嵌套结果；缺少配置不伪称可调用',async()=>{
 const calls=[],responses=[{output:{task_id:'real-id'}},{output:{task_status:'SUCCEEDED',results:{video_url:'https://result.example/video.mp4'}}}];const provider=createAvatarProvider({key:'test-secret',workspaceId:'test-workspace',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>responses.shift()};}});
 const submitted=await provider.submit({referenceImageUrl:'https://assets.example/frame.png',audioUrl:'https://assets.example/voice.mp3',resolution:'720P'});assert.equal(submitted.id,'real-id');const payload=JSON.parse(calls[0].options.body);assert.equal(payload.model,'wan2.2-s2v');assert.equal(payload.input.audio_url,'https://assets.example/voice.mp3');assert.equal((await provider.status(submitted.id)).status,'complete');
 const unconfigured=createAvatarProvider({key:'test-secret',workspaceId:''});assert.equal(unconfigured.configured,false);await assert.rejects(()=>unconfigured.submit({referenceImageUrl:'x',audioUrl:'https://assets.example/voice.mp3',resolution:'720P'}),/业务空间/);
 assert.throws(()=>creativeInputs({audioUrl:'http://localhost/voice.mp3'}),/HTTPS/);
});
