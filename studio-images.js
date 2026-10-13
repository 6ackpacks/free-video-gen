import {footspaKeyframePrompt} from './footspa-reference-library.js';
import {loadActionTemplates} from './action-templates.js';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {creativePrompt} from './studio-creative-inputs.js';
export class StudioImages {
  constructor(file,service){
    this.file=file;this.service=service;this.tasks=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];this.active=new Set();
    for(const task of this.tasks)for(const item of task.items||[])if(item.status==='submitting'){item.status='needs_review';item.error='提交结果未知，请核对生成服务后处理，避免重复生成。';}
    this.save();this.timer=setInterval(()=>this.pump(),2500);this.timer.unref();
  }
  save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.tasks,null,2));fs.renameSync(this.file+'.tmp',this.file);}
  get(id){const task=this.tasks.find(t=>t.id===id);if(!task)throw Error('底图任务不存在');return task;}
  async retry(taskId,itemId,externalId=''){
    const task=this.get(taskId),item=task.items.find(i=>i.id===itemId);if(!item)throw Error('底图记录不存在');
    if(this.active.has(item.id)||!['error','needs_review'].includes(item.status))throw Error('仅能处理失败或待核对的底图');
    if(item.status==='needs_review'){if(!/^[-a-zA-Z0-9_:]{1,150}$/.test(externalId))throw Error('请填写核对后的上游任务编号，未知提交不能直接重试');item.providerId=externalId;item.status='waiting';}
    else if(item.providerId){const result=await this.service.provider.keyframeStatus(item.providerId);if(result.status==='error'){item.previousProviderIds=[...(item.previousProviderIds||[]),item.providerId];delete item.providerId;delete item.resultUrl;item.status='queued';}else item.status='waiting';}
    else item.status='queued';
    item.error='';item.nextAt=0;this.summarize(task);this.save();queueMicrotask(()=>this.pump());return task;
  }
  create(input){
    const existing=input.requestId&&this.tasks.find(t=>t.requestId===input.requestId);if(existing)return existing;
    const p=this.service.domain.project(input.projectId),plan=p.plans.find(v=>v.id===input.planId);if(!plan)throw Error('模板不存在');
    const count=Number(input.count);if(!Number.isInteger(count)||count<1||count>30)throw Error('一次生成1–30张底图');
    if((p.videoDirection||p.templateTypeId?.endsWith(':avatar-talk'))&&!p.materials?.productImageIds?.length)throw Error('请先添加真实产品图，再生成合成关键帧');
    if(!this.service.provider.keyframeConfigured)throw Error('请在设置中配置底图生成服务');
    if(input.referenceId)this.service.references.get(input.referenceId);
    const monitor=plan.snapshot.packId==='foot-spa-store';
    const monitorFrame=[p.commonImageId,...(plan.imageIds||[])].filter(Boolean).some(id=>this.service.domain.state?.assets?.[id]?.monitorView===true);
    const roleIds=[...new Set([...(monitor?[p.commonImageId,...(plan.imageIds||[])].filter(Boolean):[]),...Object.values(p.materials||{}).flat()])];for(const id of roleIds)this.service.references.get(id);
    const task={id:randomUUID(),requestId:input.requestId,projectId:p.id,planId:plan.id,templateId:plan.templateId,templateVersion:plan.snapshot.version,monitor,scene:p.scene,status:'running',createdAt:new Date().toISOString(),items:Array.from({length:count},(_,i)=>({id:randomUUID(),name:plan.snapshot.name+' · 底图 '+(i+1),referenceIds:roleIds,prompt:`生成${plan.ratio||'9:16'}视频起始底图，真实摄影。${monitor?footspaKeyframePrompt({...plan.snapshot.actionTemplate,startPose:plan.snapshot.actionTemplate?.startPose||loadActionTemplates().find(a=>a.id===plan.snapshot.actionId)?.startPose},{ratio:plan.ratio||'9:16',personImages:!!p.materials?.personImageIds?.length,index:i+1,monitorFrame}):''}${creativePrompt(p)}\n${roleIds.length?(monitor?(monitorFrame?'按附件对应角色保留真实场景与成年人物身份，锁定已确认监控首帧的机位。人物肖像只提供身份；按模板人数与起始姿态合成同一画面。':'附件提供门店装修和人物身份，保持真实门店空间特征，允许重构为高位俯拍监控机位；人物肖像只提供身份，不能把肖像当作背景。'):'按附件素材保留产品、人物与场景身份，把它们组合在同一张关键帧中。'):''}\n${monitor&&!monitorFrame?String(plan.snapshot.imageRules||'').replace(/构图、/g,''):plan.snapshot.imageRules}\n人物：${plan.snapshot.people}\n动作开始前的正确姿态：${plan.snapshot.actionTemplate?.startPose||(monitor?loadActionTemplates().find(a=>a.id===plan.snapshot.actionId)?.startPose:'')||plan.content||plan.snapshot.description}\n${input.brief||plan.creativeBrief}\n${input.referenceId?'参考图仅借用构图、光线与风格，按本模板重构人物和主体，不照搬未指定的商品，也不直接把参考图作为视频首帧。':''}\n第${i+1}个不同画面，无字幕、无水印。`,referenceId:input.referenceId||'',status:'queued',nextAt:0}))};
    this.tasks.unshift(task);this.save();queueMicrotask(()=>this.pump());return task;
  }
  pump(){for(const task of this.tasks)for(const item of task.items||[]){if(this.active.size>=2)return;if(!['queued','waiting','running','downloading'].includes(item.status)||item.nextAt>Date.now()||this.active.has(item.id))continue;this.active.add(item.id);this.advance(task,item).catch(error=>{item.error=error.message;if(item.providerId){item.nextAt=Date.now()+15000;}else if(item.status==='submitting'){item.status=error.status>=400&&error.status<500?'error':'needs_review';}else item.status='error';}).finally(()=>{this.active.delete(item.id);this.summarize(task);this.save();});}}
  async advance(task,item){
    const {provider,references,domain}=this.service;
    if(item.status==='queued'){
      const referenceUrl=item.referenceId?await references.ensure(item.referenceId):'';const referenceUrls=[];for(const id of item.referenceIds||[])referenceUrls.push(await references.ensure(id));
      item.status='submitting';this.save();
      const result=await provider.submitKeyframe(item.prompt,{referenceUrl,referenceUrls});
      if(!result.id)throw Error('生成服务未返回底图任务编号');
      item.providerId=result.id;item.status='waiting';item.nextAt=Date.now()+3000;this.save();return;
    }
    if(item.status!=='downloading'){
      const result=await provider.keyframeStatus(item.providerId);
      if(result.status==='error'){item.status='error';item.error=result.error;return;}
      if(result.status!=='complete'){item.status=result.status;item.nextAt=Date.now()+5000;return;}
      if(!result.url)throw Error('生成服务尚未返回可用底图地址');
      item.resultUrl=result.url;item.status='downloading';this.save();
    }
    const prior=references.items.find(r=>r.studioImageItemId===item.id);
    if(prior){item.referenceIdResult=prior.id;item.status='complete';return;}
    const response=await fetch(item.resultUrl,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('下载底图失败');
    const length=Number(response.headers.get('content-length'));if(length>20*1024*1024)throw Error('底图超过20MB');
    const pieces=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>20*1024*1024)throw Error('底图超过20MB');pieces.push(chunk);}
    const ref=references.addBuffer({name:item.name,mime:(response.headers.get('content-type')||'image/png').split(';')[0],bytes:Buffer.concat(pieces),derivedFrom:item.referenceId});
    references.items.find(r=>r.id===ref.id).studioImageItemId=item.id;references.save();
    domain.state.assets[ref.id]={confirmed:false,type:'generated',monitorView:task.monitor===true,scene:task.scene,templateId:task.templateId,templateVersion:task.templateVersion,generationDescription:item.prompt,projectId:task.projectId,providerId:item.providerId,role:item.referenceId?'reference-derived':'initial-image'};domain.save();
    item.referenceIdResult=ref.id;item.status='complete';item.error='';delete item.resultUrl;
  }
  summarize(task){const items=task.items||[];task.result={imageIds:items.filter(i=>i.referenceIdResult).map(i=>i.referenceIdResult)};if(items.every(i=>i.status==='complete'))task.status='complete';else if(items.every(i=>['complete','error','needs_review'].includes(i.status))){task.status='error';task.error=items.filter(i=>i.error).map(i=>i.error).join('；');}else task.status='running';}
}
