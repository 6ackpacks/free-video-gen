import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const text=(v,max=4000)=>String(v??'').trim().slice(0,max);
export function normalizeReplica(input){
 if(!input||typeof input!=='object')throw Error('模板格式无效');
 const template=text(input.template,10000);if(!template)throw Error('请填写复刻提示词模板');
 const variables=(input.variables||[]).map(v=>{const key=text(v.key,32);if(!/^[\p{L}\p{N}_]{1,32}$/u.test(key)||key==='duration')throw Error('变量名称无效或占用了 duration');const values=[...new Set((v.values||[]).map(x=>text(x,500)).filter(Boolean))];if(!values.length||values.length>30)throw Error('每个变量需要 1–30 个候选值');return {key,label:text(v.label,40)||key,values}});
 if(variables.length>12||new Set(variables.map(v=>v.key)).size!==variables.length)throw Error('变量重复或超过12个');
 for(const match of template.matchAll(/\{\{([^{}]+)\}\}/g))if(match[1]!=='duration'&&!variables.some(v=>v.key===match[1]))throw Error('未配置变量：'+match[1]);
 const beats=(input.beats||[]).map(b=>({start:Number(b.start),end:Number(b.end),action:text(b.action,700)}));
 if(beats.length>12||beats.some((b,i)=>!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.start<0||b.end>1||b.end<=b.start||!b.action||(i&&b.start<beats[i-1].end)))throw Error('节奏段落应使用0到1之间的顺序区间');
 for(const beat of beats)for(const m of beat.action.matchAll(/\{\{([^{}]+)\}\}/g))if(m[1]!=='duration'&&!variables.some(v=>v.key===m[1]))throw Error('段落未配置变量：'+m[1]);
 return {template,variables,beats,summary:text(input.summary),fixedRules:(input.fixedRules||[]).map(x=>text(x,500)).filter(Boolean).slice(0,20),observations:(input.observations||[]).map(x=>text(x,500)).slice(0,20),uncertainties:(input.uncertainties||[]).map(x=>text(x,500)).slice(0,20)};
}
export function replicaPrompts(input,route){
 const model=normalizeReplica(input.replica);const count=Number(input.count||1),duration=Number(input.duration);
 if(!Number.isInteger(count)||count<1||count>100)throw Error('生成条数应为1–100');
 if(!route?.configured)throw Error('请选择已配置的视频模型');
 if(!Number.isFinite(duration)||duration<(route.duration?.min||1)||duration>(route.duration?.max||30)||(route.duration?.values&&!route.duration.values.includes(duration)))throw Error('所选模型不支持此时长');
 if(!['9:16','16:9','1:1'].includes(input.ratio))throw Error('画面比例无效');
 if(!route.resolutions?.includes(input.resolution))throw Error('所选分辨率不可用');
 const refs=[...new Set(input.referenceImageIds||[])];if(refs.length>3||refs.some(v=>!/^[-a-f0-9]{36}$/i.test(v)))throw Error('参考图片最多3张');
 if(refs.length&&route.referenceMode!=='reference-image')throw Error('所选模型不支持图片附件，请切换模型或取消图片');
 const combinations=model.variables.reduce((n,v)=>Math.min(1000000,n*v.values.length),1);
 const prompts=Array.from({length:count},(_,i)=>{let variant=i;const values={duration:String(duration)};for(const v of model.variables){values[v.key]=v.values[variant%v.values.length];variant=Math.floor(variant/v.values.length)}const fill=s=>s.replace(/\{\{([^{}]+)\}\}/g,(_,key)=>values[key]);const prompt=`${duration}秒，${input.ratio}，${input.resolution}。\n${fill(model.template)}\n固定规则：${model.fixedRules.join('；')}\n${model.beats.map(b=>`${+(b.start*duration).toFixed(1)}–${+(b.end*duration).toFixed(1)}秒：${fill(b.action)}`).join('\n')}`;if(route.id==='doubao'&&prompt.length>1800)throw Error('豆包提示词过长，请缩短模板至1800字以内');return {id:randomUUID(),index:i+1,skillId:'replica',skillName:text(input.name,80)||'爆款复刻',lockedPrompt:true,prompt,videoRoute:route.id,videoModel:route.model,generationMethod:route.id==='doubao'?'doubao':'apimart',duration,resolution:input.resolution,ratio:input.ratio,referenceMode:refs.length?'reference-image':'text-only',referenceImageIds:refs,seed:Math.floor(Math.random()*2147483646),characters:[],choices:{replica:true,variant:values,presetId:input.presetId||''}}});
 return {prompts,combinations,repeated:count>combinations};
}
export class ReplicaSources{
 constructor(directory){this.directory=directory;fs.mkdirSync(directory,{recursive:true});this.index=path.join(directory,'index.json');this.sources=fs.existsSync(this.index)?JSON.parse(fs.readFileSync(this.index,'utf8')):[]}
 save(){fs.writeFileSync(this.index+'.tmp',JSON.stringify(this.sources));fs.renameSync(this.index+'.tmp',this.index)}
 add(input){const duration=Number(input.duration);if(!Number.isFinite(duration)||duration<=0||duration>180)throw Error('参考视频应为180秒以内');if(!Array.isArray(input.frames)||input.frames.length<3||input.frames.length>12)throw Error('需要3–12张关键帧');const frames=input.frames.map((f,i)=>{const match=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(f.dataUrl||'');if(!match)throw Error('关键帧格式无效');const bytes=Buffer.from(match[1],'base64'),time=Number(f.time);if(bytes.length>220000||bytes.length<4||bytes[0]!==255||bytes[1]!==216||!Number.isFinite(time)||time<0||time>duration||(i&&time<=Number(input.frames[i-1].time)))throw Error('关键帧过大或时间顺序错误');return {bytes,time}});const id=randomUUID(),dir=path.join(this.directory,id);fs.mkdirSync(dir);frames.forEach((f,i)=>fs.writeFileSync(path.join(dir,i+'.jpg'),f.bytes));const source={id,name:text(input.name,100),duration,width:Number(input.width)||0,height:Number(input.height)||0,createdAt:new Date().toISOString(),frames:frames.map((f,i)=>({time:f.time,url:`/api/replica-sources/${id}/frames/${i}`}))};this.sources.unshift(source);this.save();return source}
 remove(id){const source=this.get(id),directory=path.resolve(this.directory,source.id);if(path.dirname(directory)!==path.resolve(this.directory))throw Error('参考路径无效');fs.rmSync(directory,{recursive:true,force:true});this.sources=this.sources.filter(s=>s.id!==id);this.save();return {ok:true}}
 get(id){const s=this.sources.find(s=>s.id===id);if(!s)throw Error('参考视频记录不存在');return s}
 frame(id,index){const s=this.get(id);if(!Number.isInteger(index)||index<0||index>=s.frames.length)throw Error('关键帧不存在');return fs.readFileSync(path.join(this.directory,s.id,index+'.jpg'))}
 vision(id){const s=this.get(id);return {...s,frames:s.frames.map((f,i)=>({time:f.time,dataUrl:'data:image/jpeg;base64,'+this.frame(id,i).toString('base64')}))}}
}
