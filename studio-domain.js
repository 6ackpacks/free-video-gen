import {buildCatalog, defaultType, INDUSTRIES, catalogSeeds} from './studio-catalog.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import {normalizeReplica} from './replica-workflow.js';
import {creativeInputs,creativeErrors} from './studio-creative-inputs.js';

const copy = value => structuredClone(value);
const stamp = () => new Date().toISOString();
export function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function durationValues(route, story = false) {
  if (!route?.duration) return [];
  const {min = 2, max = 15, values} = route.duration;
  return (values || Array.from({length: Math.max(0, Math.min(max, story ? 60 : 15) - min + 1)}, (_, i) => min + i)).filter(n => story || n <= 15);
}
export function actionPackSnapshot(pack) {
  if(!pack)return null;
  if(!Array.isArray(pack.actions)||pack.actions.length>30||pack.actions.some(a=>typeof a!=='string'||a.length>700))throw Error('动作包格式无效');
  return {id:String(pack.id||'').slice(0,80),name:String(pack.name||'').slice(0,80),actions:[...pack.actions]};
}
export function slotsFor(plan) {
  if (!Number.isInteger(plan.count) || plan.count < 1 || plan.count > 100) throw Error('每个模板的数量须为 1–100');
  const images = plan.imageIds || [];
  if (plan.mapping === 'custom') {
    const rows = plan.rows || [];
    if (rows.some(r => !r.imageId || !Number.isInteger(r.count) || r.count < 1) || rows.reduce((n,r) => n+r.count,0) !== plan.count) throw Error('自定义分配的合计须等于模板数量');
    return rows.flatMap(r => Array.from({length:r.count}, () => [r.imageId]));
  }
  if (plan.mapping === 'one-to-one') return Array.from({length:plan.count}, (_,i) => images[i] ? [images[i]] : []);
  if (plan.mapping === 'shots') return Array.from({length:plan.count}, (_,i) => plan.shotImages?.[i] || []);
  return Array.from({length:plan.count}, () => images[0] ? [images[0]] : []);
}
export class StudioDomain {
  constructor(file, seeds = []) {
    this.file = file;
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {schemaVersion:1,templates:[],projects:[],assets:{},requests:{},settings:{autoAllocate:true, paused:false}};
    for (const seed of seeds) if (!this.state.templates.some(t=>t.id===seed.id)) this.state.templates.push({...copy(seed),source:seed.source || 'builtin',version:1,versions:[{...copy(seed),version:1,createdAt:stamp()}],createdAt:stamp()});
    this.state.industries ||= [];
    this.save();
  }
  save() { fs.mkdirSync(path.dirname(this.file),{recursive:true}); fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.state,null,2)); fs.renameSync(this.file+'.tmp',this.file); }
  template(id) { const t=this.state.templates.find(t=>t.id===id); if(!t)throw Error('模板不存在');return t; }
  saveTemplate(input) {
    if(!String(input.name||'').trim() || !String(input.description||'').trim())throw Error('请填写模板名称和视频内容');
    const original=input.id?this.template(input.id):null;
    if(original?.source==='builtin'&&!input.copy)throw Error('内置模板请另存为我的模板');
    if(input.importId&&(!/^[a-f0-9-]{36}$/i.test(input.importId)||this.state.templates.some(t=>t.id===input.importId)))throw Error('导入模板编号无效或已存在');
    const id=!original||input.copy?input.importId||randomUUID():original.id;
    const data={...Object.fromEntries(['packId','actionId','actionTemplate','storyTemplate','legacyPresetId'].filter(k=>original?.[k]!==undefined).map(k=>[k,copy(original[k])])),id,catalogName:String(input.catalogName??original?.catalogName??''),catalogType:String(input.catalogType??original?.catalogType??''),industryId:String(input.industryId??original?.industryId??input.scene??''),name:String(input.name).slice(0,80),scene:input.scene||'',description:String(input.description).slice(0,16000),imageRules:String(input.imageRules||'').slice(0,4000),people:String(input.people||'成年人'),actions:(input.actions||[]).map(String).slice(0,30),duration:Number(input.duration)||5,mapping:input.mapping||'common',replica:input.replica?normalizeReplica(input.replica):original?.replica,actionPack:actionPackSnapshot(input.actionPack===undefined?original?.actionPack:input.actionPack),originId:input.copy?original?.id:original?.originId,originSourceId:input.originSourceId||original?.originSourceId||'',source:original&&!input.copy?original.source:input.source==='replica'?'replica':'my'};
    const version=(original&&!input.copy?original.version:0)+1;
    const item={...data,version,createdAt:original&&!input.copy?original.createdAt:stamp(),versions:[...(original&&!input.copy?original.versions:[]),{...copy(data),version,createdAt:stamp()}]};
    if(original&&!input.copy)this.state.templates[this.state.templates.indexOf(original)]=item;else this.state.templates.unshift(item);
    this.save();return item;
  }
  project(id) { const p=this.state.projects.find(p=>p.id===id);if(!p)throw Error('项目不存在');return p; }
  saveIndustry(input){
    const name=String(input.name||'').trim().normalize('NFKC');
    if(!name||name.length>30||/[\x00-\x1f]/.test(name))throw Error('请输入1–30字的行业名称');
    const existing=[...INDUSTRIES,...this.state.industries].find(i=>i.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(existing)return existing;
    const industry={id:'industry-'+randomUUID(),name};
    this.state.industries.push(industry);
    for(const seed of catalogSeeds([industry]))this.state.templates.push({...copy(seed),source:'builtin',version:1,versions:[{...copy(seed),version:1,createdAt:stamp()}],createdAt:stamp()});
    this.save();return industry;
  }
  saveProject(input) {
    const p=input.id?this.project(input.id):{id:randomUUID(),createdAt:stamp(),plans:[],submissions:[],trials:[]};
    const creative=creativeInputs(input,p);
    if(p.templateTypeId&&input.templateTypeId!==undefined&&input.templateTypeId!==p.templateTypeId)throw Error('一个项目只对应一个模板类型，请创建新项目');
    const typeId=p.templateTypeId||input.templateTypeId;
    let selectedType;
    if(typeId){
      if(p.templateTypeId&&p.templateTypeId!==typeId)throw Error('一个项目只对应一个模板类型，请创建新项目');
      selectedType=buildCatalog(this.state.templates,this.state.industries).templateTypes.find(t=>t.id===typeId);
      if(!selectedType)throw Error('模板类型不存在');
      if(input.industryId&&input.industryId!==selectedType.industryId)throw Error('行业与模板类型不匹配');
      if(input.scene&&input.scene!==selectedType.scene)throw Error('制作场景与模板类型不匹配');
      const plans=input.plans??p.plans;
      if(!Array.isArray(plans)||plans.some(plan=>!selectedType.actionIds.includes(plan.templateId)))throw Error('所选动作不属于本项目的模板类型');
    }
    if(input.plans){
      if(!Array.isArray(input.plans)||input.plans.length>30)throw Error('一次最多选择30个模板');
      const plans=input.plans.map(plan=>{
        const previous=p.plans.find(v=>v.id===plan.id),template=copy(previous?.snapshot||this.template(plan.templateId));
        delete template.versions;
        if(plan.snapshot)for(const key of ['name','description','imageRules','people','actions','duration','mapping'])if(plan.snapshot[key]!==undefined)template[key]=copy(plan.snapshot[key]);
        if(plan.snapshot?.actionPack!==undefined)template.actionPack=actionPackSnapshot(plan.snapshot.actionPack);
        if(plan.snapshot?.replica&&template.replica)template.replica=normalizeReplica(plan.snapshot.replica);
        const count=Number(plan.count),mapping=plan.mapping||template.mapping||'common';
        const clean={id:plan.id||randomUUID(),templateId:template.id,snapshot:template,count,duration:Number(plan.duration)||template.duration,videoRoute:plan.videoRoute||'doubao',resolution:plan.resolution||'',ratio:plan.ratio||previous?.ratio||'9:16',referenceMode:plan.referenceMode||previous?.referenceMode||'first-frame',autoRatio:plan.autoRatio??previous?.autoRatio??true,mapping,imageIds:plan.imageIds||[],rows:plan.rows||[],shotImages:plan.shotImages||[],creativeBrief:String(plan.creativeBrief||'').slice(0,3000),imageConfig:Object.fromEntries(['scene','people','pose','brief'].map(k=>[k,String(plan.imageConfig?.[k]??previous?.imageConfig?.[k]??'').slice(0,2000)])),content:String(plan.content||'').slice(0,16000),prompts:previous?.prompts||[],scriptConfirmed:!!plan.scriptConfirmed};
        slotsFor(clean);
        const signature=fingerprint({...clean,prompts:undefined,scriptConfirmed:undefined,...(creative.videoDirection||Object.values(creative.materials).some(v=>v.length)||Object.values(creative.productBrief).some(Boolean)||Object.values(creative.massageSpec).some(Boolean)?{creative}: {})});
        clean.prompts=clean.prompts.slice(0,count);
        // Prompt validity belongs to the server; stale editor flags cannot invalidate a completed draft.
        clean.promptsDirty=!!previous?.promptsDirty;
        if(previous?.signature!==signature){clean.promptsDirty=clean.prompts.length>0;clean.scriptConfirmed=false;}
        return {...clean,signature};
      });
      p.plans=plans;
    }
    Object.assign(p,{...creative,templateTypeId:typeId||'',peopleBrief:String(input.peopleBrief??p.peopleBrief??'').slice(0,2000),contentBrief:String(input.contentBrief??p.contentBrief??'').slice(0,3000),industryId:selectedType?.industryId||input.industryId||p.industryId||'',name:String(input.name||p.name||'未命名项目').slice(0,100),scene:input.scene||p.scene||'',imagePlanId:input.imagePlanId??p.imagePlanId??'',commonImageId:input.commonImageId??p.commonImageId??'',defaultMapping:['common','one-to-one','custom','shots'].includes(input.defaultMapping)?input.defaultMapping:p.defaultMapping,stage:['templates','prompts','images'].includes(input.stage)?input.stage:p.stage||'templates',brandName:String(input.brandName??p.brandName??'').slice(0,80),brandFacts:String(input.brandFacts??p.brandFacts??'').slice(0,30000),updatedAt:stamp()});
    if(!this.state.projects.includes(p))this.state.projects.unshift(p);
    this.save();return p;
  }
  readiness(p, routes, references) {
    const errors=creativeErrors(p,references,routes);let count=0,ready=0;
    for(const id of Object.values(p.materials||{}).flat())if(this.state.assets[id]?.archived||this.state.assets[id]?.confirmed===false)errors.push('产品、人物或场景素材尚未确认或已归档');
    for(const plan of p.plans){
      count+=plan.count;
      const route=routes.find(r=>r.id===plan.videoRoute);
      if(!durationValues(route,p.scene==='story').includes(plan.duration))errors.push(`${plan.snapshot.name}：服务不支持 ${plan.duration} 秒，请选择可用时长`);
      if(route?.configured===false)errors.push(`${plan.snapshot.name}：生成服务尚未配置`);
      if(!['9:16','16:9','1:1'].includes(plan.ratio||'9:16'))errors.push(`${plan.snapshot.name}：请选择有效画面比例`);
      if(!['first-frame','reference-image'].includes(plan.referenceMode||'first-frame'))errors.push(`${plan.snapshot.name}：请选择有效图片用途`);
      const slots=slotsFor(plan);
      if(plan.referenceMode==='first-frame'&&slots.some(ids=>ids.length>1))errors.push(`${plan.snapshot.name}：初始画面最多选择一张图片`);
      if(slots.some(ids=>ids.length)&&route?.referenceMode&&route.referenceMode!=='reference-image')errors.push(`${plan.snapshot.name}：此服务不支持真实图片附件，请切换支持图生视频的服务`);
      for(const ids of slots){
        const valid=((p.scene==='story'||!p.scene)&&!ids.length)||ids.length&&ids.every(id=>{try{references.get(id);return !this.state.assets[id]?.archived && this.state.assets[id]?.confirmed!==false;}catch{return false;}});
        if(valid)ready++;
      }
      if(p.scene==='massage' && plan.mapping==='one-to-one' && new Set(plan.imageIds.slice(0,plan.count)).size!==plan.count)errors.push(`${plan.snapshot.name}：逐张按摩制作需每条视频独立的已确认人物底图`);
      if(plan.prompts.length!==plan.count)errors.push(`${plan.snapshot.name}：请生成提示词`);
      if(plan.promptsDirty)errors.push(`${plan.snapshot.name}：设置已变更，请重新生成或确认保留的提示词`);
      if(plan.videoRoute==='doubao'&&plan.prompts.some(text=>text.length>1900))errors.push(`${plan.snapshot.name}：豆包提示词过长，请精简到1900字以内，避免被截断`);
      if(route&&!route.resolutions.includes(plan.resolution))errors.push(`${plan.snapshot.name}：请选择可用画质`);
      if(p.scene==='story'&&!plan.scriptConfirmed)errors.push(`${plan.snapshot.name}：请确认脚本与分镜`);
    }
    if(!count)errors.push('请选择动作');
    if(ready<count)errors.push(`底图已准备 ${ready}/${count} 条`);
    if(p.scene==='story'&&(!p.brandName||!p.brandFacts))errors.push('请填写宣传主体与已确认的品牌事实');
    return {count,ready,errors:[...new Set(errors)]};
  }
  currentFingerprint(p,plan,index){return fingerprint({signature:plan.signature,prompt:plan.prompts[index],images:slotsFor(plan)[index],brand:p.brandName,facts:p.brandFacts,...(p.videoDirection||Object.values(p.materials||{}).some(v=>v.length)||Object.values(p.productBrief||{}).some(Boolean)||Object.values(p.massageSpec||{}).some(Boolean)?{creative:creativeInputs(p)}:{})});}
  adopted(p,queue){return p.trials.filter(t=>{const plan=p.plans.find(v=>v.id===t.planId);return plan && t.adopted && queue.state.jobs.find(j=>j.id===t.jobId)?.status==='complete' && this.currentFingerprint(p,plan,t.index)===t.fingerprint;});}
}
