import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Explicitly invoked real-provider acceptance run; request IDs survive interruptions.
const root=path.resolve('data/release-validation-20261015');
const file=path.join(root,'manifest.json');
const base=process.env.VALIDATION_BASE||'http://127.0.0.1:4192';
fs.mkdirSync(root,{recursive:true});
const manifest=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{runId:'release-20261015',startedAt:new Date().toISOString(),cases:[]};
const assets=JSON.parse(fs.readFileSync(path.join(root,'assets.json'),'utf8'));
const save=()=>{manifest.updatedAt=new Date().toISOString();fs.writeFileSync(file+'.tmp',JSON.stringify(manifest,null,2));fs.renameSync(file+'.tmp',file);};
async function api(route,body){const response=await fetch(base+'/api'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(65000)});const result=await response.json();if(!response.ok)throw Error(result.error||result.detail||'HTTP '+response.status);return result;}
const info={
 footspa:{role:'足浴门店接待员',product:'接待服务手册',facts:'演示门店有木饰走廊与独立服务房间；工作人员提供接待与项目说明。',script:'欢迎了解我们的门店，先看看环境，再选择适合的服务。'},
 massage:{role:'成年上门按摩护理师',product:'护理毛巾',facts:'演示家庭客厅提供日常足部放松护理，使用干净毛巾，双手轻柔托住脚踝；不宣传医疗功效。',script:'这是日常放松护理，我们先准备干净毛巾，再轻柔照顾足部。'},
 ktv:{role:'KTV包厢服务员',product:'点歌触屏',facts:'演示包厢有沙发、茶水、水果和点歌触屏；服务员提供点歌设备介绍。',script:'欢迎来到包厢，点歌触屏就在这里，有需要可以询问工作人员。'},
 jewelry:{role:'珠宝门店顾问',product:'银手镯',facts:'演示珠宝柜台展示一只银色手镯；顾问用绒布托盘展示可见造型，不承诺材质等级和保值收益。',script:'这款手镯造型简洁，可以先看看细节，再选择喜欢的搭配。'},
 food:{role:'咖啡师',product:'拿铁咖啡',facts:'演示咖啡店有木柜台、咖啡机和靠窗座位；咖啡师制作并递上一杯拿铁，不涉及价格或功效。',script:'这是一杯刚准备好的拿铁，您可以在窗边慢慢享用。'},
 homecare:{role:'家政保洁员',product:'清洁喷壶与抹布',facts:'演示家庭客厅内，保洁员使用透明无品牌清洁喷壶和干净抹布擦拭桌面；不作消毒或除菌承诺。',script:'我们先整理桌面，再用干净抹布擦拭，认真处理看得见的细节。'}
};
async function createCase(c,catalog){
 const type=catalog.templateTypes.find(t=>t.id===c.typeId),industry=catalog.industries.find(i=>i.id===type.industryId),detail=info[type.industryId],image=assets[type.industryId];
 const story=type.scene==='story',avatar=type.categoryId==='avatar-talk',home=type.id==='massage:service',promo=['environment','service','product-service'].includes(type.id.split(':').at(-1))&&!home;
 const template=story?(type.actionIds.map(id=>catalog.templates.find(t=>t.id===id)).find(t=>t?.storyTemplate?.acquisitionPattern==='mini-drama')||catalog.templates.find(t=>t.id===type.actionIds[0])):catalog.templates.find(t=>t.id===(home?'massage:home-pov-full':type.actionIds[0]));
 c.title='验收·'+industry.name+'·'+type.name;c.requestId||=manifest.runId+'-'+c.typeId.replace(':','-');c.templateName=template.name;c.duration=story?15:10;save();
 const existing=catalog.projects.find(p=>p.name===c.title);
 const p=await api('/studio/projects',{...(existing?{id:existing.id}:{}),name:c.title,scene:type.scene,industryId:type.industryId,templateTypeId:type.id,stage:'templates',brandName:'演示'+industry.name,brandFacts:detail.facts,peopleBrief:detail.role+'，衣着整洁，保持参考图同一成年人物。',contentBrief:'本项目仅用于功能验收，素材为AI虚构演示，不代表真实商家。',materials:{sceneImageIds:[image],personImageIds:avatar||promo?[image]:[],productImageIds:avatar||promo?[image]:[]},productBrief:avatar?{name:detail.product,sellingPoints:detail.facts,script:detail.script,voice:'自然清晰中文'}:{},massageSpec:home?{homeScene:'sofa'}:{},promotion:promo?{enabled:true,name:'演示'+industry.name,sellingPoints:detail.facts,serviceProcess:'介绍场所或物品、演示一个真实步骤、自然收尾',personRole:detail.role,copy:'',cta:'了解服务详情'}:{},plans:[{templateId:template.id,count:1,duration:c.duration,videoRoute:'doubao',resolution:'由豆包决定',ratio:'9:16',referenceMode:'reference-image',mapping:'common',imageIds:[image],displayFormat:promo?(type.id.endsWith(':environment')?'tour':'process'):'',creativeBrief:story?'两名成年人物，一位顾客询问，一位工作人员依据已确认资料介绍。一个小顾虑、一个真实服务细节、自然收尾，不虚构顾客推荐或疗效。':'保持参考中的真实空间与人物身份，仅完成当前模板的核心动作。',prompts:[]}]});
 c.projectId=p.id;c.planId=p.plans[0].id;c.status='created';save();
 if(story){const task=await api('/studio/projects/'+p.id+'/draft',{requestId:c.requestId+'-draft',mode:'all'});c.taskId=task.id;c.taskKind='drafts';c.status='drafting';}
 else await submit(c,promo);
 save();
}
async function submit(c,promo=false){const task=await api('/studio/projects/'+c.projectId+(promo?'/produce':'/generate-video'),promo?{mode:'batch',requestId:c.requestId}:{trial:false,prepareImages:false,requestId:c.requestId});c.taskId=task.id;c.taskKind=promo?'productions':'video-productions';c.status='preparing';save();}
async function advance(c,works){
 if(c.status==='complete'){
  if(c.cacheReady||!c.jobId)return;
  const cache=await api('/video/'+c.jobId+'/cache');
  c.cacheReady=cache.ready;c.cacheBytes=cache.bytes;c.cacheError=cache.error||'';
  if(!cache.ready&&!cache.running&&(c.cacheAttempts||0)<3){c.cacheAttempts=(c.cacheAttempts||0)+1;await api('/video/'+c.jobId+'/cache',{});}
  return;
 }
 if(['error','needs_review'].includes(c.status))return;
 if(c.taskKind==='drafts'){
  const task=await api('/studio/drafts/'+c.taskId);
  if(task.status==='error')throw Error(task.error);
  if(task.status!=='complete')return;
  const p=await api('/studio/projects/'+c.projectId);
  await api('/studio/projects/'+c.projectId+'/prompts',{confirm:true,plans:p.plans.map(v=>({id:v.id,prompts:v.prompts,scriptConfirmed:true}))});
  await submit(c);return;
 }
 const jobs=works.filter(j=>j.projectId===c.projectId);
 if(!jobs.length){const task=await api('/studio/'+c.taskKind+'/'+c.taskId);if(task.status==='error')throw Error(task.error);c.stage=task.stage||task.status;return;}
 const job=jobs.at(-1);Object.assign(c,{jobId:job.id,status:job.status,stage:job.providerProgress?.message||job.status,error:job.error||'',providerId:job.providerId||'',prompt:job.prompt,outputs:job.outputs});
 if(job.status==='complete'&&job.outputs?.length){c.videoUrl='/api/video/'+job.id+'?preview=1';c.completedAt=job.completedAt||new Date().toISOString();await api('/video/'+job.id+'/cache',{});}
}
const catalog=await api('/studio');
for(const type of catalog.templateTypes.filter(t=>info[t.industryId]&&t.source==='builtin'))if(!manifest.cases.some(c=>c.typeId===type.id))manifest.cases.push({typeId:type.id,status:'pending'});
save();
for(const c of manifest.cases){if(c.status!=='pending')continue;try{await createCase(c,catalog);}catch(error){c.status='error';c.error=error.message;save();}console.log(c.typeId,c.status,c.error||'');}
for(let tick=0;tick<2160;tick++){
 try{const works=await api('/studio/works');for(const c of manifest.cases)try{await advance(c,works);}catch(error){if(c.status==='complete')c.cacheError=error.message;else{c.status='error';c.error=error.message;}}save();console.log(new Date().toISOString(),JSON.stringify(manifest.cases.reduce((r,c)=>(r[c.status]=(r[c.status]||0)+1,r),{})));if(manifest.cases.every(c=>c.status==='complete'?(c.cacheReady||c.cacheAttempts>=3&&c.cacheError):['error','needs_review'].includes(c.status)))break;}catch(error){console.log('Connection retry:',error.message);}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
manifest.finishedAt=new Date().toISOString();save();
