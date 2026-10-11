import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StudioDomain,slotsFor,durationValues} from './studio-domain.js';
import {StudioService,studioSeeds} from './studio-service.js';
import {VideoQueue} from './queue.js';
import {StudioImages} from './studio-images.js';
import {saveStudioConnections} from './studio-connections.js';
const route={id:'doubao',configured:true,duration:{min:5,max:15,values:[5,10,15]},resolutions:['auto']};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const seeds=['a','b','c'].map(id=>({id,name:id,description:'真实空间自然动作',actions:['行走'],duration:5,mapping:'common',scene:'footspa'}));const domain=new StudioDomain(path.join(dir,'data','studio.json'),seeds);return {dir,domain,seeds};}
const plan=(id,count=1)=>({templateId:id,count,duration:5,videoRoute:'doubao',resolution:'auto',imageIds:['image'],mapping:'common'});
const refs={get(id){if(!id)throw Error('missing');return {id};}};
test('配置校验失败不改变运行服务地址，地址不能夹带密钥',t=>{
  const {dir}=fixture(t),before=process.env.APIMART_BASE_URL;
  assert.throws(()=>saveStudioConnections(dir,{values:{APIMART_BASE_URL:'https://example.org',TEXT_PROVIDER:'invalid'}}),/配置无效/);
  assert.equal(process.env.APIMART_BASE_URL,before);
  assert.throws(()=>saveStudioConnections(dir,{values:{APIMART_BASE_URL:'https://user:password@example.org'}}),/独立字段/);
  assert.equal(fs.existsSync(path.join(dir,'data','studio-connections.json')),false);
});
test('未返回上游编号的成功响应保留待核对，不能自动重新计费',async t=>{
  const {dir}=fixture(t);let submitted=0;
  const q=new VideoQueue(path.join(dir,'data','empty-id.json'),{supportsIdempotency:false,submit:async()=>{submitted++;return {};}});
  t.after(()=>clearInterval(q.timer));q.enqueue([{id:'no-id',lockedPrompt:true,prompt:'prompt',duration:5}]);
  await new Promise(r=>setTimeout(r,10));q.pump();
  assert.equal(submitted,1);assert.equal(q.state.jobs[0].status,'needs_review');assert.throws(()=>q.retry('no-id'),/禁止/);
});
test('复刻动作包保存版本后在提示词中生效，后续包修改不影响旧计划',async t=>{
  const {dir,domain}=fixture(t),pack={id:'pack',name:'商品动作',actions:['缓慢旋转展示']};
  const template=domain.saveTemplate({name:'商品展示',description:'展示商品',replica:{template:'展示{{产品}}',variables:[{key:'产品',values:['耳机']}],beats:[]},actionPack:pack});
  pack.actions[0]='后来修改';
  const p=domain.saveProject({plans:[{...plan(template.id,2),imageIds:[]}]});
  const service=Object.create(StudioService.prototype);Object.assign(service,{domain,provider:{routes:[route]}});service.project=id=>domain.project(id);
  await service.generate(p.id);assert.ok(p.plans[0].prompts.every(v=>v.includes('缓慢旋转展示')));assert.ok(p.plans[0].prompts.every(v=>!v.includes('后来修改')));
});
test('A02 新内容包配置进入同一个制作台，不增加一级导航',()=>{const result=studioSeeds({state:{presets:[]}},[{id:'cafe',name:'咖啡店',engine:'background-variants',description:'咖啡场景',actions:[{id:'serve',name:'递咖啡',actionText:'服务人员自然递出一杯咖啡。'}]}]);assert.equal(result.scenes[0].id,'cafe');assert.equal(result.templates[0].description,'服务人员自然递出一杯咖啡。');});
test('A03/A04/A06 多模板 5+3+2=10，独立时长与自定义分配无乘法',t=>{
  const {domain}=fixture(t),p=domain.saveProject({scene:'footspa',plans:[plan('a',5),plan('b',3),plan('c',2)]});p.plans.forEach(v=>v.prompts=Array(v.count).fill('prompt'));
  assert.equal(domain.readiness(p,[route],refs).count,10);assert.equal(domain.readiness(p,[route],refs).ready,10);
  p.plans[0].duration=6;assert.match(domain.readiness(p,[route],refs).errors.join(''),/不支持 6 秒/);assert.equal(p.plans[1].duration,5);
  assert.equal(slotsFor({...plan('a',5),mapping:'custom',rows:[{imageId:'a',count:3},{imageId:'b',count:2}]}).length,5);
  assert.throws(()=>slotsFor({...plan('a',5),mapping:'custom',rows:[{imageId:'a',count:6}]}),/合计/);
  assert.deepEqual(durationValues(route),[5,10,15]);
});
test('A05/A07 按摩五条需要五张独立已确认人物底图',t=>{
  const {domain}=fixture(t),p=domain.saveProject({scene:'massage',plans:[{...plan('a',5),mapping:'one-to-one',imageIds:['1','2']} ]});p.plans[0].prompts=Array(5).fill('prompt');
  assert.equal(domain.readiness(p,[route],refs).ready,2);assert.match(domain.readiness(p,[route],refs).errors.join(''),/独立/);
  p.plans[0].imageIds=['1','2','3','4','5'];domain.state.assets['5']={confirmed:false};assert.equal(domain.readiness(p,[route],refs).ready,4);
  domain.state.assets['5'].confirmed=true;assert.deepEqual(domain.readiness(p,[route],refs).errors,[]);
});
test('A08/A09/A10 内置副本、项目修改与新版本隔离，重载保留旧版本',t=>{
  const {domain,dir}=fixture(t),p=domain.saveProject({plans:[plan('a')]});
  assert.throws(()=>domain.saveTemplate({id:'a',name:'a',description:'改'}),/内置/);
  const mine=domain.saveTemplate({id:'a',copy:true,name:'我的',description:'新动作',actions:['站立','转身']});
  const updated=domain.saveTemplate({...mine,description:'新版',actions:['转身','站立']});assert.equal(updated.version,2);assert.equal(updated.versions[0].description,'新动作');assert.equal(domain.template('a').description,'真实空间自然动作');
  const input=structuredClone(p);input.plans[0].snapshot.description='项目独立修改';domain.saveProject(input);assert.equal(domain.project(p.id).plans[0].snapshot.description,'项目独立修改');assert.equal(domain.template('a').description,'真实空间自然动作');
  const reloaded=new StudioDomain(path.join(dir,'data','studio.json'));assert.equal(reloaded.template(mine.id).versions.length,2);
});
test('A12/A13 试片采用一条后只补四条，改内容或底图时失效',t=>{
  const {domain}=fixture(t),p=domain.saveProject({plans:[plan('a',5)]});const first=p.plans[0];first.prompts=Array(5).fill('one');p.trials.push({jobId:'trial',planId:first.id,index:0,adopted:true,fingerprint:domain.currentFingerprint(p,first,0)});const queue={state:{jobs:[{id:'trial',status:'complete'}]}};
  assert.equal(domain.adopted(p,queue).length,1);first.prompts[0]='changed';assert.equal(domain.adopted(p,queue).length,0);
});
test('A14/A15 无账号保留排队，待核对任务不能直接重试',async t=>{
  const {dir}=fixture(t);const queue=new VideoQueue(path.join(dir,'q.json'),{routes:[route],submit:async()=>{const e=Error('需登录');e.waitForAccount=true;throw e;}},{maxSubmits:1});t.after(()=>clearInterval(queue.timer));
  queue.enqueue([{id:'a',lockedPrompt:true,prompt:'p',duration:5,videoRoute:'doubao'}]);await new Promise(r=>setTimeout(r,20));assert.equal(queue.state.jobs[0].status,'queued');assert.equal(queue.state.jobs[0].attempts,0);
  queue.state.jobs[0].status='needs_review';assert.throws(()=>queue.retry('a'),/核对/);
});
test('A16/A17/A21 提交幂等、采纳试片仅补四槽、短剧确认前阻止提交',t=>{
  const {domain}=fixture(t);const queue={state:{jobs:[]},enqueue(jobs){const b={id:'batch',count:jobs.length};this.state.jobs.push(...jobs);return b;}};
  const service=Object.assign(Object.create(StudioService.prototype),{domain,queue,references:refs,provider:{routes:[route]}}),p=domain.saveProject({scene:'footspa',plans:[plan('a',5)]});p.plans[0].prompts=Array(5).fill('prompt');const first=p.plans[0];p.trials.push({jobId:'trial',planId:first.id,index:0,adopted:true,fingerprint:domain.currentFingerprint(p,first,0)});queue.state.jobs.push({id:'trial',status:'complete'});
  assert.equal(service.submit({projectId:p.id,requestId:'submit'}).count,4);assert.equal(service.submit({projectId:p.id,requestId:'submit'}).count,4);assert.equal(queue.state.jobs.length,5);
  assert.throws(()=>service.submit({projectId:p.id,requestId:'different'}),/已提交/);
  const story=domain.saveProject({scene:'story',brandName:'测试主体',brandFacts:'真实资料',plans:[{...plan('b'),mapping:'shots',imageIds:[],shotImages:[]} ]});story.plans[0].prompts=['已生成脚本与分镜'];assert.throws(()=>service.submit({projectId:story.id,requestId:'story'}),/确认脚本/);story.plans[0].scriptConfirmed=true;assert.equal(service.submit({projectId:story.id,requestId:'story'}).count,1);
});
test('A20/A23 草稿重载与归档保留引用及模板快照',t=>{
  const {domain,dir}=fixture(t),p=domain.saveProject({name:'草稿',plans:[plan('a')]});domain.template('a').archived=true;domain.state.assets.image={archived:true};domain.save();
  const reloaded=new StudioDomain(path.join(dir,'data','studio.json'));assert.equal(reloaded.project(p.id).plans[0].imageIds[0],'image');assert.equal(reloaded.project(p.id).plans[0].snapshot.name,'a');assert.equal(reloaded.template('a').archived,true);
});
test('底图重启保留上游编号继续查询；未知提交不自动重交',t=>{
  const {dir}=fixture(t),file=path.join(dir,'data','images.json');fs.writeFileSync(file,JSON.stringify([{id:'x',items:[{id:'1',status:'waiting',providerId:'external'},{id:'2',status:'submitting'}]}]));
  const manager=new StudioImages(file,{});t.after(()=>clearInterval(manager.timer));assert.equal(manager.tasks[0].items[0].providerId,'external');assert.equal(manager.tasks[0].items[1].status,'needs_review');
});
test('A07 底图任务去重、保存待确认素材与生成版本，不伪造图片完成',async t=>{
  const {dir,domain}=fixture(t),p=domain.saveProject({scene:'massage',plans:[plan('a')]}),provider={keyframeConfigured:true,submitKeyframe:async()=>({id:'external'}),keyframeStatus:async()=>({status:'complete',url:'data:image/png;base64,iVBORw0KGgo='})};
  const stored=[],references={items:stored,get:id=>({id}),save(){},addBuffer(input){const asset={id:'asset',...input};stored.push(asset);return asset;}};
  const manager=new StudioImages(path.join(dir,'data','image-tasks.json'),{domain,provider,references});t.after(()=>clearInterval(manager.timer));
  const task=manager.create({projectId:p.id,planId:p.plans[0].id,count:1,requestId:'unique'});assert.equal(manager.create({projectId:p.id,planId:p.plans[0].id,count:1,requestId:'unique'}).id,task.id);
  // Drive the durable task explicitly instead of waiting for wall-clock polls.
  await new Promise(r=>setTimeout(r,5));const item=task.items[0];assert.equal(item.providerId,'external');await manager.advance(task,item);manager.summarize(task);
  assert.equal(task.status,'complete');assert.equal(stored.length,1);assert.equal(domain.state.assets.asset.confirmed,false);assert.equal(domain.state.assets.asset.templateVersion,1);assert.match(domain.state.assets.asset.generationDescription,/起始底图/);
  domain.state.assets.asset.confirmed=true;assert.equal(stored.length,1);
});
test('A12 只试所选画面，其他模板未准备不会阻止这一条试片',t=>{
  const {domain}=fixture(t),p=domain.saveProject({scene:'footspa',plans:[plan('a'),{...plan('b',3),imageIds:[]} ]});p.plans[0].prompts=['prompt'];const queue={state:{jobs:[],batches:[]},enqueue(jobs){const batch={id:'trial-batch',count:jobs.length};this.state.jobs.push(...jobs);this.state.batches.push(batch);return batch;}};
  const service=Object.assign(Object.create(StudioService.prototype),{domain,queue,references:refs,provider:{routes:[route]}});assert.equal(service.submit({projectId:p.id,planId:p.plans[0].id,index:0,trial:true,requestId:'one'}).count,1);
});
