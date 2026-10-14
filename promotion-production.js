import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {creativeInputs} from './studio-creative-inputs.js';
import {promotionCategory,promotionErrors} from './promotion-model.js';
import {fingerprint,slotsFor} from './studio-domain.js';

const inputFingerprint=p=>fingerprint({promotion:p.promotion,materials:p.materials,people:p.peopleBrief,brief:p.contentBrief,plans:p.plans.map(v=>({id:v.id,signature:v.signature}))});
export function savePromotionPreset(service,input){
  const {domain,references,provider}=service;
  const source=domain.project(input.projectId),name=String(input.name||'').trim().slice(0,100);
  if(!promotionCategory(source)||!source.promotion?.enabled)throw Error('请先填写环境或服务宣传资料');
  if(!name)throw Error('请填写预设名称');
  const errors=promotionErrors({...source,plans:[]},references,provider.routes);if(errors.length)throw Error(errors.join('；'));
  const original=input.id&&domain.state.promotionPresets.find(p=>p.id===input.id);
  if(input.id&&!original)throw Error('宣传预设不存在');
  const preset={id:original?.id||randomUUID(),name,industryId:source.industryId,version:(original?.version||0)+1,creative:creativeInputs(source),peopleBrief:source.peopleBrief||'',createdAt:original?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(original)domain.state.promotionPresets[domain.state.promotionPresets.indexOf(original)]=preset;else domain.state.promotionPresets.unshift(preset);
  domain.save();return preset;
}
export function applyPromotionPreset(service,id,projectId){
  const p=service.domain.project(projectId),preset=service.domain.state.promotionPresets.find(v=>v.id===id);
  if(!preset)throw Error('宣传预设不存在');
  if(!promotionCategory(p))throw Error('此项目不支持宣传预设');
  if(p.industryId!==preset.industryId)throw Error('请选择当前行业的宣传预设');
  const errors=promotionErrors({...p,...preset.creative,plans:[]},service.references,service.provider.routes);if(errors.length)throw Error(errors.join('；'));
  const materials=preset.creative.materials;
  const base=promotionCategory(p)==='environment'?materials.sceneImageIds[0]:materials.productImageIds[0]||materials.sceneImageIds[0];
  const plans=p.plans.map(v=>({...v,mapping:'common',imageIds:base?[base]:[],rows:[],shotImages:[]}));
  return service.domain.saveProject({...p,...structuredClone(preset.creative),peopleBrief:preset.peopleBrief,commonImageId:base||'',promotionPresetId:preset.id,promotionPresetVersion:preset.version,plans});
}

export class PromotionProduction {
  constructor(file,service){
    this.file=file;this.service=service;this.tasks=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
    for(const task of this.tasks)if(task.status==='preparing'){
      const batch=service.domain.state.requests[task.requestId];
      if(batch){task.status='submitted';task.batchId=batch.id;}
      else{task.status='error';task.error='制作准备被工作台重启中断，请重试。';}
    }
    this.save();
  }
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.tasks,null,2));fs.renameSync(this.file+'.tmp',this.file);}
  busy(projectId){return this.tasks.find(t=>t.projectId===projectId&&t.status==='preparing');}
  get(id){const task=this.tasks.find(v=>v.id===id);if(!task)throw Error('制作任务不存在');return {...task,jobs:task.batchId?this.service.works().filter(j=>j.batchId===task.batchId):[]};}
  start(projectId,input){
    const p=this.service.domain.project(projectId),requestId=String(input.requestId||'');
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))throw Error('缺少有效制作标识');
    const prior=this.tasks.find(t=>t.requestId===requestId);
    if(prior){if(prior.projectId!==projectId)throw Error('制作标识已用于其他项目');return this.get(prior.id);}
    if(!promotionCategory(p)||!p.promotion?.enabled)throw Error('请先确认环境或服务宣传资料');
    const active=this.busy(projectId);if(active)return this.get(active.id);
    if(this.service.queue.state.jobs.some(j=>j.projectId===p.id&&!['complete','error','cancelled'].includes(j.status)))throw Error('本项目正在制作视频，请等待当前任务完成');
    const trial=input.mode!=='remaining',plan=p.plans.find(v=>v.id===input.planId)||p.plans[0],index=Number(input.index??0);
    if(!plan||!Number.isInteger(index)||index<0||index>=plan.count)throw Error('请选择有效样片');
    let check=p;
    if(trial){const ids=slotsFor(plan)[index];check={...p,plans:[{...plan,count:1,mapping:'shots',shotImages:[ids],imageIds:ids,prompts:['制作准备'],promptsDirty:false}]};}
    else check={...p,plans:p.plans.map(v=>({...v,prompts:Array(v.count).fill('制作准备'),promptsDirty:false}))};
    const errors=this.service.domain.readiness(check,this.service.provider.routes,this.service.references).errors;
    if(errors.length)throw Error(errors.join('；'));
    if(!trial){
      const t=p.trials.find(v=>v.jobId===input.jobId),job=this.service.queue.state.jobs.find(j=>j.id===input.jobId);
      if(!t||job?.status!=='complete'||!job.outputs?.length)throw Error('请先完成并确认一条样片');
      const current=p.plans.find(v=>v.id===t.planId);
      if(!current||this.service.domain.currentFingerprint(p,current,t.index)!==t.fingerprint)throw Error('资料、模板或设置已变更，请重新生成样片');
      if(this.service.queue.state.jobs.some(j=>j.projectId===p.id&&!j.isTrial&&j.status!=='cancelled'))throw Error('剩余视频已经提交，请重试失败项');
      if(p.plans.reduce((n,v)=>n+v.count,0)<=1)throw Error('这套只有一条视频，样片即为成品');
      for(const other of p.trials)other.adopted=other===t;
    }
    for(const v of p.plans)if(v.promptsDirty){v.prompts=[];v.promptsDirty=false;}
    this.service.domain.save();
    const task={id:randomUUID(),projectId,requestId,mode:trial?'sample':'remaining',videoRoute:plan.videoRoute,contentSource:plan.videoRoute==='doubao'?'template':'text-model',failureStage:'content',planId:plan.id,index,status:'preparing',createdAt:new Date().toISOString(),inputFingerprint:inputFingerprint(p)};
    this.tasks.unshift(task);this.save();
    // Persist the intent before rewriting. The continuation runs even if the browser closes.
    Promise.resolve().then(async()=>{
      await this.service.generate(projectId,progress=>{Object.assign(task,progress);this.save();},'missing',trial?{planId:plan.id,index}:null);
      const current=this.service.domain.project(projectId);
      if(inputFingerprint(current)!==task.inputFingerprint)throw Error('制作资料已变更，请重新生成样片');
      task.failureStage='video-submit';this.save();
      const batch=this.service.submit({projectId,trial,planId:plan.id,index,requestId});
      task.batchId=batch.id;task.status='submitted';
    }).catch(error=>{task.status='error';task.error=error.message;}).finally(()=>this.save());
    return this.get(task.id);
  }
}
