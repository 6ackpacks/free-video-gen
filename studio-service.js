import {catalogSeeds, buildCatalog} from './studio-catalog.js';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {StudioDomain, slotsFor} from './studio-domain.js';
import {listContentPacks, contentPackActionDirectory} from './content-packs.js';
import {loadActionTemplates, templatesWithCompatibility} from './action-templates.js';
import {STORY_TEMPLATES} from './story-library.js';
import {DraftTasks} from './draft-tasks.js';
import {StudioImages} from './studio-images.js';
import {creativePrompt,creativeErrors} from './studio-creative-inputs.js';
import {replicaPrompts} from './replica-workflow.js';
import {footspaReferences,footspaActionPrompt,FOOTSPA_REFERENCE_CATALOG} from './footspa-reference-library.js';

export function studioSeeds(workspace,packs=listContentPacks()) {
  const scenes=packs.map(p=>({id:p.id==='foot-spa-store'?'footspa':p.id==='home-massage'?'massage':p.id==='ktv-business'?'ktv':p.id,name:p.navLabel||p.name,description:p.description,packId:p.id,engine:p.engine}));
  scenes.push({id:'story',name:'短剧宣传',description:'用已确认的品牌资料创作剧情与分镜',engine:'timeline-story'});
  const templates=[];
  for(const scene of scenes.filter(s=>s.packId)){
    const pack=packs.find(p=>p.id===scene.packId);
    const actions=pack.actionLibrary?loadActionTemplates(contentPackActionDirectory(pack),{expectedCount:pack.expectedActionCount}):pack.actions.map(a=>({...a,actionText:a.actionText||a.description||(pack.id==='home-massage'?(a.name==='连续足部按摩'?'成年服务人员对成年顾客进行自然、连续的足部按摩，保留人物起始姿态和接触位置。':'成年服务人员对成年顾客进行轻柔的肩颈放松，保留起始姿态和空间布局。'):a.name)}));
    for(const action of actions)templates.push({id:scene.id+':'+action.id,name:action.name,scene:scene.id,packId:pack.id,actionId:action.id,actionTemplate:action,description:action.actionText,actions:[action.actionText],people:String(action.people||2)+' 位成年人',duration:5,mapping:scene.id==='massage'?'one-to-one':'common',imageRules:scene.id==='massage'?'每条视频独立底图，须包含成年服务人员与成年顾客、正确接触部位与起始姿态。':'保留真实空间、门的位置、构图、装修颜色与光线；仅加入自然的成年人物动作。'});
  }
  for(const t of STORY_TEMPLATES)templates.push({id:'story:'+t.id,name:t.name,scene:'story',description:t.rules||t.description||t.name,storyTemplate:t,actions:[],people:'按脚本确定成年人物',duration:15,mapping:'shots',imageRules:'按已确认分镜准备角色与商品图片，不从图片文件名推断品牌事实。'});
  for(const p of workspace.state.presets||[])if(p.kind==='replica')templates.push({id:p.id,name:p.name,scene:'',description:p.replica.template,replica:p.replica,source:p.sourceId?'replica':'my',originSourceId:p.sourceId||'',duration:p.settings?.duration||5,mapping:'common',actions:(p.replica.beats||[]).map(b=>b.action),imageRules:'可替换初始画面与模板变量，保留已确认节奏。',legacyPresetId:p.id,actionPack:structuredClone((workspace.state.actionPacks||[]).find(a=>a.id===p.settings?.actionPackId)||null)});
  templates.push(...catalogSeeds());return {scenes,templates};
}
export class StudioService {
  constructor({root,provider,queue,references,workspace,storyLibrary,replicaSources,presentation,media}){
    Object.assign(this,{root,provider,queue,references,workspace,storyLibrary,replicaSources,presentation,media});
    const seed=studioSeeds(workspace);this.scenes=seed.scenes;
    this.domain=new StudioDomain(path.join(root,'data','studio.json'),seed.templates);
    for(const template of this.domain.state.templates)if(template.legacyPresetId&&template.version===1&&template.description===template.name&&template.replica?.template){template.description=template.replica.template;template.versions[0].description=template.description;}
    for(const seedTemplate of seed.templates)if(seedTemplate.actionPack){const t=this.domain.state.templates.find(t=>t.id===seedTemplate.id);if(t?.version===1&&t.actionPack===undefined){t.actionPack=structuredClone(seedTemplate.actionPack);t.versions[0].actionPack=structuredClone(seedTemplate.actionPack);}}
    this.drafts=new DraftTasks(path.join(root,'data','studio-drafts.json'),(input,report)=>this.generate(input.projectId,report));
    this.images=new StudioImages(path.join(root,'data','studio-image-tasks.json'),this);
    queue.studioSettings=this.domain.state.settings;
    for(const job of queue.state.jobs.filter(j=>j.projectId&&j.isTrial&&j.slotFingerprint)){
      const project=this.domain.state.projects.find(p=>p.id===job.projectId);
      if(project&&!project.trials.some(t=>t.jobId===job.id))project.trials.push({jobId:job.id,planId:job.planId,index:job.slotIndex,fingerprint:job.slotFingerprint,adopted:false});
    }
    this.domain.save();
  }
  assets(){
    const images=this.references.list().map(r=>({...r,type:r.assetKind==='generated'?'generated':'upload',...this.domain.state.assets[r.id]}));
    const videos=this.replicaSources.sources.map(r=>({...r,type:'reference-video',previewUrl:r.frames?.length?`/api/replica-sources/${r.id}/frames/0`:'',...this.domain.state.assets[r.id]}));
    const brands=this.storyLibrary.list().map(r=>({...r,type:'brand',...this.domain.state.assets[r.id]}));
    return [...images,...videos,...brands];
  }
  works(){return this.queue.state.jobs.map(j=>({...j,sceneId:j.projectId?j.sceneId:j.packId==='ktv-business'?'ktv':j.packId==='foot-spa-store'?'footspa':j.skillId==='story-ad'?'story':j.skillId==='paired-reference'?'massage':j.sceneId,templateId:j.templateId||(j.actionId?`${j.packId||'historical'}:${j.actionId}`:undefined),templateName:j.templateName||j.actionName||j.skillName||j.actionTemplate?.name||'历史未分类'}));}
  overview(){const catalog=buildCatalog(this.domain.state.templates,this.domain.state.industries);return {...catalog,scenes:[...this.scenes,...catalog.industries.filter(i=>i.id!=='general'&&!this.scenes.some(s=>s.id===i.id)).map(i=>({...i,description:i.name,engine:'generic'}))],templates:this.domain.state.templates.map(t=>({...t,example:t.packId&&t.actionId?this.presentation.example(t.packId,t.actionId,this.queue.state.jobs):null,referenceClips:t.packId==='foot-spa-store'?footspaReferences(this.root,t.actionId):[]})),footspaReferenceClips:footspaReferences(this.root),footspaSources:FOOTSPA_REFERENCE_CATALOG.sources,projects:this.domain.state.projects,assets:this.assets(),actionPacks:this.workspace.state.actionPacks||[],imageTasks:this.images.tasks.map(t=>({id:t.id,projectId:t.projectId,createdAt:t.createdAt,status:t.status,items:t.items.map(i=>({id:i.id,name:i.name,status:i.status,error:i.error,providerId:i.providerId,referenceIdResult:i.referenceIdResult}))})),routes:this.provider.routes,keyframeConfigured:this.provider.keyframeConfigured,settings:this.domain.state.settings};}
  project(id){const p=this.domain.project(id);return {...p,readiness:this.domain.readiness(p,this.provider.routes,this.references),adopted:this.domain.adopted(p,this.queue)};}
  async generate(id,report=()=>{}){
    const p=this.domain.project(id);
    const inputErrors=creativeErrors(p,this.references,this.provider.routes);if(inputErrors.length)throw Error(inputErrors.join('；'));
    let completed=0;const total=p.plans.reduce((n,v)=>n+v.count,0);
    for(const plan of p.plans){
      const signature=plan.signature;
      const monitor=plan.snapshot.packId==='foot-spa-store'&&plan.snapshot.actionTemplate;
      const baseFor=index=>(monitor?footspaActionPrompt(plan.snapshot.actionTemplate,{duration:plan.duration,ratio:plan.ratio,personImages:!!p.materials?.personImageIds?.length,index}):plan.content||plan.snapshot.description)+'\n已确认动作顺序：'+plan.snapshot.actions.join('；')+'\n'+(plan.content?'用户编辑的动作补充：'+plan.content+'\n':'')+creativePrompt(p)+(monitor&&p.peopleBrief?'\n人物造型补充（不得改变模板人数）：'+p.peopleBrief:'');
      if(plan.snapshot.replica){
        const jobs=replicaPrompts({replica:plan.snapshot.replica,count:plan.count,duration:plan.duration,videoRoute:plan.videoRoute,resolution:plan.resolution,ratio:'9:16',referenceImageIds:[],actionPack:plan.snapshot.actionPack,actionPackId:plan.snapshot.actionPack?.id,creativeBrief:plan.creativeBrief},this.provider.routes.find(r=>r.id===plan.videoRoute));
        const current=this.domain.project(id).plans.find(v=>v.id===plan.id);current.prompts=jobs.prompts.map((j,i)=>j.prompt+(slotsFor(plan)[i].length?'\n附件是本画面的初始图片或主体参考；使用附件中的主体替换原视频对应内容，保留模板的镜头风格和相对节奏。':''));current.promptsDirty=false;this.domain.save();completed+=plan.count;report({completed,total});continue;
      }
      const prompts=[];
      for(let offset=0;offset<plan.count;offset+=10){
      const result=await this.provider.rewritePrompts({mode:p.scene==='story'?'story':p.scene==='massage'?'paired':'store',creativeBrief:plan.creativeBrief,outputLanguage:'zh',context:{brandName:p.brandName,brandFacts:p.brandFacts,imageRules:plan.snapshot.imageRules,actions:plan.snapshot.actions,duration:plan.duration,sceneEvidence:(plan.imageIds||[]).map(id=>this.references.get(id).sceneProfile),requirements:monitor?'保留给定核心事件、成年人物数量、进入顺序和结束状态；每条一个固定机位连续镜头，按给定时长重写自然动作节奏。用户想法只能调整造型、神态与细节；不改变门的位置、场景类型或结尾。不要额外添加第二个事件。':(p.videoDirection||p.templateTypeId?.endsWith(':avatar-talk'))?'按用户确认的视频方向与文案，在指定时长内输出完整短片提示词；不要覆盖单场景口播或一镜到底约束。':p.scene==='story'?'输出完整脚本和编号分镜；仅用品牌事实，未知信息写待确认。':`单个固定镜头，1–2个自然动作，不改变底图空间。每条人物外貌、自然穿搭、表情和细节有所变化，保持动作一致。${p.scene==='ktv'?'KTV商业氛围，不套用足浴或监控风格。':''}`},items:Array.from({length:Math.min(10,plan.count-offset)},(_,i)=>({id:String(offset+i),prompt:`第${offset+i+1}条，${plan.duration}秒。模板规则：${baseFor(offset+i+1)}\n人物：${plan.snapshot.people}\n图片要求：${plan.snapshot.imageRules}\n${p.scene==='story'?`宣传主体：${p.brandName}\n已确认资料：${p.brandFacts}\n请生成完整脚本和按时间顺序编号的分镜。`:''}`}))});
      prompts.push(...result.items.map(v=>v.prompt));report({completed:completed+prompts.length,total});
      }
      const current=this.domain.project(id).plans.find(v=>v.id===plan.id);
      if(current?.signature!==signature)throw Error('设置已变更，请重新生成提示词');
      current.prompts=prompts;current.promptsDirty=false;current.scriptConfirmed=false;this.domain.save();completed+=plan.count;
    }
    return this.project(id);
  }
  jobs(p,only){
    return p.plans.flatMap(plan=>slotsFor(plan).map((ids,index)=>{
      if(only&&(only.planId!==plan.id||only.index!==index))return null;
      const template=plan.snapshot;
      if(template.packId && template.actionId && ids[0]){
        const profile=this.references.get(ids[0]).sceneProfile;
        const pack=listContentPacks().find(v=>v.id===template.packId);
        if(pack?.actionLibrary&&profile){const compat=templatesWithCompatibility(profile,contentPackActionDirectory(pack),{expectedCount:pack.expectedActionCount}).find(v=>v.id===template.actionId);if(compat&&!compat.compatibility.compatible)throw Error(compat.compatibility.reasons.join('；'));}
      }
      return {id:randomUUID(),index:index+1,skillId:p.scene==='story'?'story-ad':'studio',sceneId:p.scene,projectId:p.id,planId:plan.id,slotIndex:index,templateId:plan.templateId,templateVersion:template.version,templateSnapshot:structuredClone(template),templateName:template.name,packId:template.packId,actionId:template.actionId,actionTemplate:template.actionTemplate,duration:plan.duration,videoRoute:plan.videoRoute,resolution:plan.resolution,ratio:plan.ratio||'9:16',prompt:plan.prompts[index],lockedPrompt:true,referenceImageIds:plan.referenceMode==='reference-image'?[...new Set([...ids,...Object.values(p.materials||{}).flat()])]:ids,audioUrl:p.avatarMode==='audio-driven'?p.audioUrl:'',nativeAudio:!!p.productBrief?.script||!!p.productBrief?.music,referenceId:ids[0]||'',referenceMode:plan.referenceMode||(ids.length>1?'reference-image':'first-frame'),exportName:`${p.scene}/${template.name}/${String(index+1).padStart(3,'0')}.mp4`};
    }).filter(Boolean));
  }
  submit(input){
    const p=this.domain.project(input.projectId),requestId=String(input.requestId||'');
    if(!requestId)throw Error('缺少提交标识');
    if(this.domain.state.requests[requestId])return this.domain.state.requests[requestId];
    const prior=this.queue.state.jobs.find(j=>j.studioRequestId===requestId);
    if(prior)return this.queue.state.batches.find(b=>b.id===prior.batchId);
    if(p.templateTypeId){
      const selection=input.generationSettings;
      if(!selection||['videoRoute','ratio','resolution','referenceMode'].some(key=>!selection[key]))throw Error('每次生成前必须选择并确认生成参数');
      if(p.plans.some(plan=>['videoRoute','ratio','resolution','referenceMode'].some(key=>plan[key]!==selection[key])))throw Error('生成参数与项目计划不一致，请重新确认');
    }
    let validationProject=p;
    if(input.trial){
      const plan=p.plans.find(v=>v.id===input.planId),index=Number(input.index)||0;
      if(!plan||!Number.isInteger(index)||index<0||index>=plan.count)throw Error('请选择一个有效试片画面');
      const images=slotsFor(plan)[index];validationProject={...p,plans:[{...plan,count:1,prompts:plan.prompts[index]?[plan.prompts[index]]:[],mapping:plan.mapping==='shots'?'shots':'one-to-one',imageIds:images,shotImages:[images]}]};
    }
    const ready=this.domain.readiness(validationProject,this.provider.routes,this.references);if(ready.errors.length)throw Error(ready.errors.join('；'));
    let jobs=this.jobs(p,input.trial?{planId:input.planId,index:Number(input.index)||0}:null);
    if(input.trial){if(jobs.length!==1)throw Error('试片只能选择一个画面');}
    else {
      const adopted=this.domain.adopted(p,this.queue);
      jobs=jobs.filter(j=>!adopted.some(t=>t.planId===j.planId&&t.index===j.slotIndex));
      const existing=this.queue.state.jobs.filter(j=>j.projectId===p.id&&!j.isTrial&&!['cancelled'].includes(j.status));
      if(existing.length)throw Error('项目已提交，请在我的作品重试失败项或创建副本，避免重复生产');
    }
    if(!jobs.length)throw Error('所有画面已有采纳的试片');
    for(const job of jobs){job.isTrial=!!input.trial;job.studioRequestId=requestId;job.slotFingerprint=this.domain.currentFingerprint(p,p.plans.find(v=>v.id===job.planId),job.slotIndex);}
    const batch=this.queue.enqueue(jobs);
    if(input.trial){const plan=p.plans.find(v=>v.id===input.planId);p.trials.push({jobId:jobs[0].id,planId:plan.id,index:jobs[0].slotIndex,fingerprint:this.domain.currentFingerprint(p,plan,jobs[0].slotIndex),adopted:false});}
    p.submissions.push({batchId:batch.id,trial:!!input.trial,createdAt:new Date().toISOString()});
    this.domain.state.requests[requestId]=batch;this.domain.save();return batch;
  }
}
