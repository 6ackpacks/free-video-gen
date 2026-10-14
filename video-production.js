import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {slotsFor} from './studio-domain.js';
import {compatibility} from './action-templates.js';

// One persisted user intent prepares content and submits it without a second click.
export class VideoProduction {
 constructor(file,service){this.file=file;this.service=service;this.tasks=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];for(const task of this.tasks)if(task.status==='preparing'){const batch=service.domain.state.requests[task.requestId];Object.assign(task,batch?{status:'submitted',batchId:batch.id}:{status:'error',error:'工作台重启中断了视频准备，请重试。'});}this.save();}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.tasks,null,2));fs.renameSync(this.file+'.tmp',this.file);}
 busy(projectId){return this.tasks.find(v=>v.projectId===projectId&&v.status==='preparing');}
 get(id){const task=this.tasks.find(v=>v.id===id);if(!task)throw Error('视频制作任务不存在');const batch=this.service.domain.state.requests[task.requestId];if(batch&&task.status!=='submitted'){task.status='submitted';task.batchId=batch.id;this.save();}return {...task,jobs:task.batchId?this.service.works().filter(j=>j.batchId===task.batchId):[]};}
 start(projectId,input){
  const p=this.service.domain.project(projectId),requestId=String(input.requestId||'');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))throw Error('缺少有效制作标识');
  const prior=this.tasks.find(v=>v.requestId===requestId);if(prior&&prior.projectId!==projectId)throw Error('制作标识已用于其他项目');if(prior&&(prior.status!=='error'||this.service.domain.state.requests[requestId]))return this.get(prior.id);
  const busy=this.busy(projectId);if(busy)return this.get(busy.id);
  const trial=!!input.trial,plan=p.plans.find(v=>v.id===input.planId)||p.plans[0],index=Number(input.index||0);
  const prepareImages=p.templateTypeId==='footspa:monitor'&&input.prepareImages!==false;
  const sourceIds=prior?.sourceIds||input.sceneReferenceIds||[];if(!Array.isArray(sourceIds)||sourceIds.length>12)throw Error('场景参考最多12张');for(const id of sourceIds){this.service.references.get(id);if(this.service.domain.state.assets[id]?.archived)throw Error('所选场景已归档，请更换参考场景');}
  if(prepareImages&&!this.service.provider.keyframeConfigured)throw Error('请先在设置中配置图片生成服务');
  if(!plan||!Number.isInteger(index)||index<0||index>=plan.count)throw Error('请选择有效动作');
  this.service.assertProductionAvailable(projectId,trial,plan.id,index);
  const checkPlans=trial?[{...plan,count:1,mapping:'shots',shotImages:[slotsFor(plan)[index]],imageIds:slotsFor(plan)[index],prompts:['后台准备'],promptsDirty:false}]:p.plans.map(v=>({...v,prompts:Array(v.count).fill('后台准备'),promptsDirty:false}));
  const errors=this.service.domain.readiness({...p,plans:checkPlans},this.service.provider.routes,this.service.references).errors.filter(e=>!prepareImages||!e.startsWith('底图已准备'));if(errors.length)throw Error(errors.join('；'));
  const task=prior||{id:randomUUID(),projectId,requestId,createdAt:new Date().toISOString()};Object.assign(task,{status:'preparing',trial,planId:plan.id,index,error:'',stage:'content'});if(!prior)this.tasks.unshift(task);this.save();
  task.sourceIds=sourceIds;task.prepareImages=prepareImages;this.save();
  for(const v of p.plans)if((!trial||v.id===plan.id)&&v.promptsDirty){if(trial){v.prompts=Array.from({length:v.count},(_,i)=>i===index?'':v.prompts?.[i]||'');}else v.prompts=[];v.promptsDirty=false;}this.service.domain.save();
  Promise.resolve().then(async()=>{
   if(prepareImages){task.stage='scene';this.save();for(const id of sourceIds)if(!this.service.references.get(id).sceneProfile&&this.service.references.analyze)await this.service.references.analyze(id);
    let offset=0;for(const v of p.plans){for(let i=0;i<v.count;i++){if(trial&&(v.id!==plan.id||i!==index))continue;const id=sourceIds[(offset+i)%sourceIds.length],profile=id&&this.service.references.get(id).sceneProfile;if(profile&&v.snapshot.actionTemplate){const check=compatibility(v.snapshot.actionTemplate,profile);if(!check.compatible)throw Error(v.snapshot.name+'：上传场景不支持该动作，'+check.reasons.join('；'));}}offset+=v.count;}
    let flow=this.service.monitorWorkflow.create(projectId,{sourceIds,independent:true,restart:!task.workflowId,only:trial?{planId:plan.id,index}:null,autoVideo:false});task.workflowId=flow.id;task.imageTotal=flow.slots.length;task.stage='images';this.save();
    if(flow.status==='error'){if(flow.slots.some(s=>s.status==='needs_review'))throw Error('图片提交结果需要核对，请先查询已有图片任务');for(const slot of flow.slots.filter(s=>s.status==='error'))await this.service.monitorWorkflow.retry(projectId,slot.id);}
    while(!['images_ready','ready','error'].includes(flow.status)){task.imageCompleted=flow.slots.filter(s=>s.status==='complete').length;this.save();await new Promise(r=>setTimeout(r,500));flow=this.service.monitorWorkflow.get(projectId);}
    if(flow.status==='error')throw Error(flow.error||flow.slots.find(s=>s.error)?.error||'部分图片生成失败，请重试失败项');
    this.service.monitorWorkflow.confirm(projectId,{autoDraft:false});task.imageCompleted=flow.slots.length;task.stage='content';this.save();for(const v of p.plans)if(!trial||v.id===plan.id){if(trial){v.prompts=Array.from({length:v.count},(_,i)=>i===index?'':v.prompts?.[i]||'');}else v.prompts=[];v.promptsDirty=false;}this.service.domain.save();
   }
   while(this.service.drafts?.tasks.some(t=>t.projectId===projectId&&t.status==='running'))await new Promise(resolve=>setTimeout(resolve,500));
   await this.service.generate(projectId,progress=>{Object.assign(task,progress);this.save();},'missing',trial?{planId:plan.id,index}:null);
   task.stage='submit';this.save();const batch=this.service.submit({projectId,requestId,trial,planId:plan.id,index,generationSettings:input.generationSettings},true);Object.assign(task,{status:'submitted',batchId:batch.id});
  }).catch(error=>Object.assign(task,{status:'error',error:error.message})).finally(()=>this.save());
  return this.get(task.id);
 }
}
