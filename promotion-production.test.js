import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StudioDomain} from './studio-domain.js';
import {StudioService} from './studio-service.js';
import {catalogSeeds} from './studio-catalog.js';
import {promotionPrompt,normalizePromotion} from './promotion-model.js';
import {PromotionProduction,savePromotionPreset,applyPromotionPreset} from './promotion-production.js';
import {studioApi} from './studio-api.js';
const route={id:'test',configured:true,nativeAudio:true,referenceMode:'reference-image',resolutions:['720P'],duration:{values:[5,10]}};
function fixture(t,category='environment'){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'promotion-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const domain=new StudioDomain(path.join(root,'studio.json'),catalogSeeds()),template=domain.template('catalog:food:'+category+':1');
  const p=domain.saveProject({name:'店铺宣传',industryId:'food',scene:'food',templateTypeId:'food:'+category,promotion:{enabled:true,name:'街角咖啡馆',sellingPoints:'有独立座位和自然光',serviceProcess:'研磨咖啡豆、萃取、出杯'},materials:{sceneImageIds:['scene'],productImageIds:[],personImageIds:[]},plans:[{templateId:template.id,displayFormat:category==='environment'?'space':'process',count:3,duration:5,videoRoute:'test',resolution:'720P',ratio:'9:16',referenceMode:'reference-image',imageIds:['scene'],mapping:'common'}]});
  const rewrites=[];
  const service=Object.create(StudioService.prototype);
  Object.assign(service,{domain,provider:{routes:[route],rewritePrompts:async input=>{rewrites.push(input);return {items:input.items.map(v=>({id:v.id,prompt:'镜头缓慢推进，展示真实空间与独立座位。'}))};}},references:{get(id){if(!['scene','person','product'].includes(id))throw Error('missing');return {id};}},queue:{state:{jobs:[],batches:[]},enqueue(jobs){const batch={id:'batch-'+this.state.batches.length};jobs.forEach(j=>Object.assign(j,{batchId:batch.id,status:'queued',createdAt:new Date().toISOString()}));this.state.jobs.push(...jobs);this.state.batches.push(batch);return batch;}}});
  service.promotionProduction=new PromotionProduction(path.join(root,'tasks.json'),service);
  return {root,domain,p,service,rewrites};
}
async function finish(flow,id){for(let i=0;i<100;i++){const task=flow.get(id);if(task.status!=='preparing')return task;await new Promise(r=>setTimeout(r,2));}throw Error('任务未结束');}
test('一次点击只准备所选样片，自动提交视频；重复请求不重复生产',async t=>{
  const {service,p,rewrites}=fixture(t),flow=service.promotionProduction;
  const task=flow.start(p.id,{requestId:'sample-one',mode:'sample',planId:p.plans[0].id,index:1});
  assert.equal(flow.start(p.id,{requestId:'sample-one'}).id,task.id);
  assert.equal(flow.start(p.id,{requestId:'sample-second-click'}).id,task.id);
  assert.equal((await finish(flow,task.id)).status,'submitted');
  assert.equal(rewrites.length,1);assert.deepEqual(rewrites[0].items.map(v=>v.id),['1']);assert.equal(rewrites[0].mode,'promotion');
  assert.equal(service.queue.state.jobs.length,1);assert.equal(service.queue.state.jobs[0].slotIndex,1);assert.deepEqual(p.plans[0].prompts,['','镜头缓慢推进，展示真实空间与独立座位。','']);
});
test('确认完成样片后只生成剩余槽位，样片不重新生成，重复批量请求不重发',async t=>{
  const {service,p,rewrites}=fixture(t),flow=service.promotionProduction;
  const task=flow.start(p.id,{requestId:'sample',planId:p.plans[0].id});await finish(flow,task.id);
  const sample=service.queue.state.jobs[0];sample.status='complete';sample.outputs=[{url:'https://example.org/sample.mp4'}];
  const remaining=flow.start(p.id,{requestId:'remaining',mode:'remaining',jobId:sample.id});assert.equal((await finish(flow,remaining.id)).status,'submitted');
  assert.equal(service.queue.state.jobs.length,3);assert.deepEqual(rewrites[1].items.map(v=>v.id),['1','2']);
  assert.equal(service.queue.state.jobs.filter(j=>!j.isTrial).length,2);assert.ok(p.trials[0].adopted);
  assert.equal(flow.start(p.id,{requestId:'remaining',mode:'remaining',jobId:sample.id}).id,remaining.id);
});
test('样片未完成或成片地址缺失时不允许批量制作；资料变更需要新样片',async t=>{
  const {service,p,domain}=fixture(t),flow=service.promotionProduction;
  assert.throws(()=>flow.start(p.id,{requestId:'invalid',mode:'remaining'}),/完成并确认/);
  const task=flow.start(p.id,{requestId:'sample'});await finish(flow,task.id);const sample=service.queue.state.jobs[0];sample.status='complete';
  assert.throws(()=>flow.start(p.id,{requestId:'no-output',mode:'remaining',jobId:sample.id}),/完成并确认/);
  sample.outputs=[{url:'x'}];domain.saveProject({...p,promotion:{...p.promotion,sellingPoints:'新增真实卖点'},plans:p.plans});
  assert.throws(()=>flow.start(p.id,{requestId:'stale',mode:'remaining',jobId:sample.id}),/已变更/);
});
test('后台准备失败显示原因，不提交视频，修改资料不会被旧任务覆盖',async t=>{
  const {service,p,domain}=fixture(t);let release;
  service.provider.rewritePrompts=()=>new Promise(r=>{release=r;});
  const task=service.promotionProduction.start(p.id,{requestId:'slow'});await new Promise(r=>setTimeout(r,5));
  domain.saveProject({...p,promotion:{...p.promotion,sellingPoints:'修改内容'},plans:p.plans});
  release({items:[{id:'0',prompt:'旧内容'}]});const result=await finish(service.promotionProduction,task.id);
  assert.equal(result.status,'error');assert.match(result.error,/已变更/);assert.equal(service.queue.state.jobs.length,0);
});
test('重启中断的准备任务明确失败；已提交的任务从提交记录恢复',t=>{
  const {service,root,p}=fixture(t),file=path.join(root,'recover.json');
  service.domain.state.requests.done={id:'existing-batch'};
  fs.writeFileSync(file,JSON.stringify([{id:'pending',projectId:p.id,requestId:'pending',status:'preparing'},{id:'done',projectId:p.id,requestId:'done',status:'preparing'}]));
  const flow=new PromotionProduction(file,service);assert.equal(flow.get('pending').status,'error');assert.equal(flow.get('done').batchId,'existing-batch');
});
test('宣传预设保存后可用于同一行业的环境与服务展示，后续修改不污染原预设',t=>{
  const {service,p,domain,root}=fixture(t),preset=savePromotionPreset(service,{projectId:p.id,name:'咖啡馆常用宣传'});
  const template=domain.template('catalog:food:service:1');const other=domain.saveProject({industryId:'food',templateTypeId:'food:service',scene:'food',plans:[{templateId:template.id,count:1}]});
  const applied=applyPromotionPreset(service,preset.id,other.id);assert.equal(applied.promotion.name,p.promotion.name);assert.deepEqual(applied.materials.sceneImageIds,['scene']);
  applied.promotion.name='当前项目新名字';assert.equal(preset.creative.promotion.name,'街角咖啡馆');
  const restored=new StudioDomain(path.join(root,'studio.json'));assert.equal(restored.state.promotionPresets[0].name,'咖啡馆常用宣传');
  service.references.get=()=>{throw Error('missing');};assert.throws(()=>applyPromotionPreset(service,preset.id,other.id),/不存在/);
});
test('环境与服务编写规则不同，人物不随机换装、服务不强迫持商品；日期校验',t=>{
  const {p}=fixture(t);const text=promotionPrompt(p,p.plans[0]);assert.match(text,/环境展示/);assert.match(text,/环境图=scene/);assert.match(text,/不套监控/);
  const service={...p,templateTypeId:'food:service',promotion:{...p.promotion,personRole:'咖啡师'}};
  assert.match(promotionPrompt(service,{...p.plans[0],displayFormat:'intro'}),/不强制持有商品/);
  assert.throws(()=>normalizePromotion({startDate:'2026-02-30'}),/日期无效/);assert.throws(()=>normalizePromotion({startDate:'2026-10-15',endDate:'2026-10-14'}),/早于/);
});
test('样片单槽提示词可以直接修订，剩余提示词不用提前生成',async t=>{
  const {service,p}=fixture(t),task=service.promotionProduction.start(p.id,{requestId:'sample'});await finish(service.promotionProduction,task.id);
  let response;const req={method:'POST'},res={};
  await studioApi(service,req,res,new URL('http://local/api/studio/projects/'+p.id+'/prompts'),{body:async()=>({slot:{planId:p.plans[0].id,index:0,prompt:'小幅平移，重点展示桌面与自然光。'}}),reply:(_,code,value)=>{response=value;}});
  assert.equal(response.plans[0].prompts[0],'小幅平移，重点展示桌面与自然光。');assert.equal(response.plans[0].prompts[1],'');
});
test('选择的新模型、画质、比例和图片用途进入样片与剩余任务',async t=>{
  const {service,p,domain}=fixture(t);
  service.provider.routes.push({...route,id:'tokendance-seedance-2.5',resolutions:['720P','1080P']});
  domain.saveProject({...p,plans:p.plans.map(v=>({...v,videoRoute:'tokendance-seedance-2.5',resolution:'1080P',ratio:'16:9',referenceMode:'first-frame',duration:10}))});
  const sampleTask=service.promotionProduction.start(p.id,{requestId:'selected-model'});assert.equal((await finish(service.promotionProduction,sampleTask.id)).status,'submitted');
  const sample=service.queue.state.jobs[0];Object.assign(sample,{status:'complete',outputs:[{url:'https://example.org/sample.mp4'}]});
  const remainingTask=service.promotionProduction.start(p.id,{requestId:'selected-remaining',mode:'remaining',jobId:sample.id});assert.equal((await finish(service.promotionProduction,remainingTask.id)).status,'submitted');
  for(const job of service.queue.state.jobs){assert.equal(job.videoRoute,'tokendance-seedance-2.5');assert.equal(job.resolution,'1080P');assert.equal(job.ratio,'16:9');assert.equal(job.referenceMode,'first-frame');assert.equal(job.duration,10);}
});
test('改成豆包后不调用TokenDance文本准备，样片和剩余视频均交给豆包',async t=>{
  const {service,p,domain}=fixture(t);
  service.provider.routes.push({...route,id:'doubao'});
  service.provider.rewritePrompts=async()=>{throw Error('TokenDance：额度不足');};
  domain.saveProject({...p,plans:p.plans.map(v=>({...v,videoRoute:'doubao'}))});
  const task=service.promotionProduction.start(p.id,{requestId:'doubao-sample'});
  assert.equal((await finish(service.promotionProduction,task.id)).status,'submitted');
  const sample=service.queue.state.jobs[0];assert.equal(sample.videoRoute,'doubao');assert.match(sample.prompt,/街角咖啡馆/);assert.match(sample.prompt,/自然光/);
  Object.assign(sample,{status:'complete',outputs:[{url:'https://example.org/sample.mp4'}]});
  const remaining=service.promotionProduction.start(p.id,{requestId:'doubao-rest',mode:'remaining',jobId:sample.id});assert.equal((await finish(service.promotionProduction,remaining.id)).status,'submitted');
  assert.equal(service.queue.state.jobs.length,3);assert.ok(service.queue.state.jobs.every(j=>j.videoRoute==='doubao'));
});

test('直接批量生成无需样片，按所选数量提交全部视频',async t=>{
 const {service,p,rewrites}=fixture(t);
 const task=service.promotionProduction.start(p.id,{requestId:'direct-batch',mode:'batch'});
 assert.equal((await finish(service.promotionProduction,task.id)).status,'submitted');
 assert.equal(rewrites[0].items.length,3);
 assert.equal(service.queue.state.jobs.length,3);
 assert.ok(service.queue.state.jobs.every(j=>!j.isTrial));
 assert.equal(p.trials.length,0);
});

test('人物带逛绑定行业工作人员、连续跟拍和设施讲解',async t=>{
 const {service,p}=fixture(t);service.provider.routes=[{...route,id:'doubao'}];p.plans[0].videoRoute='doubao';p.plans[0].displayFormat='tour';p.plans[0].duration=10;p.promotion.personRole='咖啡师';
 const task=service.promotionProduction.start(p.id,{requestId:'tour-batch',mode:'batch'});
 assert.equal((await finish(service.promotionProduction,task.id)).status,'submitted');
 assert.match(service.queue.state.jobs[0].prompt,/咖啡师/);assert.match(service.queue.state.jobs[0].prompt,/镜头.*跟随|连续跟拍/);
 assert.match(service.queue.state.jobs[0].prompt,/双引号/);assert.match(service.queue.state.jobs[0].prompt,/不是顾客闲逛、模特摆拍/);
});
