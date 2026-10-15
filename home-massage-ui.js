import {generationSettingsMarkup} from './video-settings.js';
import {sharedStepBar} from './studio-template-selection.js';

export function renderHomeMassageStudio(ctx){
 const {project:p,app,esc,api,post,toast}=ctx;let data=ctx.data,timer,busy=false;
 clearTimeout(renderHomeMassageStudio.timer);const token=Symbol();renderHomeMassageStudio.token=token;
 p.materials||={sceneImageIds:[],personImageIds:[],productImageIds:[]};p.massageSpec||={};
 const routes=data.routes.filter(r=>r.configured&&(r.id==='doubao'||r.id.includes('tokendance'))&&r.referenceMode==='reference-image'&&!r.audioDriven),r=routes.find(r=>r.id===p.plans[0]?.videoRoute)||routes[0];
 const choice={videoRoute:r?.id||'',ratio:p.plans[0]?.ratio||'9:16',resolution:p.plans[0]?.resolution||r?.resolutions[0]||'',referenceMode:p.plans[0]?.referenceMode||'reference-image'};
 const $=id=>app.querySelector('#'+id),asset=id=>data.assets.find(a=>a.id===id),dirty=()=>{p.plans.forEach(v=>v.promptsDirty=true);};
 const save=async()=>{clearTimeout(timer);Object.assign(p,await ctx.save());};
 const changed=()=>{dirty();clearTimeout(timer);timer=setTimeout(()=>save().catch(e=>toast(e.message)),450);};
 const options=(items,id)=>items.map(v=>`<option value="${esc(v.id??v)}" ${(v.id??v)===id?'selected':''}>${esc(v.name??v)}</option>`).join('');
 const role=(key,label)=>`<section class="home-photo-role"><h3>${label}</h3><div class="thumbs">${(p.materials[key]||[]).map(id=>`<div class="home-role-image"><button type="button" data-home-preview="${id}" aria-label="放大${label}"><img src="${esc(asset(id)?.previewUrl||'')}" alt="${label}"></button><button type="button" data-home-remove="${key}:${id}" aria-label="移除${label}">×</button></div>`).join('')}</div><div class="row"><button data-home-upload="${key}">上传${label}</button><button data-home-pick="${key}">从我的素材选择</button></div></section>`;
 app.className='monitor-studio home-massage-studio';
 app.innerHTML=`<button data-shared-step="templates" class="text-button">‹ 返回选择模板</button>${sharedStepBar('production')}<div class="studio-page-title"><h1>上门按摩 · 底图与视频</h1><p>普通家庭、手机随手拍。先准备所选护理动作的画面，再生成视频。</p></div><div class="home-photo-layout"><section class="card home-photo-materials"><h2>家庭与人物素材</h2><label class="field">上门服务环境<select id="homePhotoScene">${options([{id:'sofa',name:'普通家庭客厅 · 沙发'},{id:'bed',name:'普通家庭卧室 · 床边'}],p.massageSpec.homeScene||'sofa')}</select></label>${role('sceneImageIds','家庭环境图')}${role('personImageIds','技师人物图')}<label class="field">技师形象（选填）<input id="homePhotoPeople" value="${esc(p.peopleBrief||'')}" placeholder="有参考图时保持同一身份；没有时按固定成人造型生成"></label><label class="field">品牌胸牌文字（选填）<input id="homePhotoBrand" maxlength="20" value="${esc(p.massageSpec.brandText||'')}" placeholder="只使用你提供的品牌，不默认添加伊趣舒心"></label><p class="notice">家庭图用于环境，人物图用于身份。视频底图是一张完整单幅照片，不是界面封面的九宫格。准备好的护理原图可以直接使用。</p></section><section class="card home-photo-plans"><h2>所选护理模板</h2><div id="homePhotoPlans"></div><section id="homePhotoSettings" class="project-generation-settings"></section><button id="homePhotoGenerate" class="primary wide">批量生成视频</button><p class="muted">内容自动准备后提交视频，直接在下方查看结果。</p></section></div><section class="card home-photo-results"><h2>底图与视频结果</h2><div id="homePhotoProgress" role="status"></div><div id="homePhotoCandidates"></div><div id="homePhotoVideos"></div></section>`;
 app.querySelectorAll('[data-shared-step]').forEach(b=>b.onclick=()=>{if(b.dataset.sharedStep==='templates')ctx.go('templates');});
 const durations=id=>{const r=routes.find(r=>r.id===id);return r?.duration.values||Array.from({length:Math.max(0,Math.min(15,r?.duration.max||15)-(r?.duration.min||5)+1)},(_,i)=>i+(r?.duration.min||5));};
 function plans(){
  const images=data.assets.filter(a=>['upload','generated'].includes(a.type)&&a.confirmed!==false&&!a.archived);
  $('homePhotoPlans').innerHTML=p.plans.map(v=>`<article class="home-photo-plan"><h3>${esc(v.snapshot.name)}</h3><p class="muted">${esc(v.snapshot.description)}</p><div class="row"><label>数量<input type="number" min="1" max="100" data-home-count="${v.id}" value="${v.count}"></label><label>时长<select data-home-duration="${v.id}">${options(durations(v.videoRoute),v.duration)}</select> 秒</label></div><label class="field">视频底图<select data-home-frame="${v.id}"><option value="">选择已准备好的完整护理图</option>${options(images.map(a=>({id:a.id,name:a.name})),v.imageIds[0])}</select></label>${v.imageIds[0]?`<img class="home-frame-preview" src="${esc(asset(v.imageIds[0])?.previewUrl||'')}" alt="所选护理底图">`:''}<div class="row"><button data-home-upload-frame="${v.id}">上传护理原图直接使用</button><button data-home-generate="${v.id}">按此模板准备底图</button></div><details><summary>查看拍照构图要求</summary><p>${esc(v.snapshot.imageRules)}</p></details></article>`).join('');
  app.querySelectorAll('[data-home-count]').forEach(el=>el.onchange=()=>{const value=Number(el.value);if(!Number.isInteger(value)||value<1||value>100){toast('数量须为1–100');el.value=1;return;}p.plans.find(v=>v.id===el.dataset.homeCount).count=value;changed();});
  app.querySelectorAll('[data-home-duration]').forEach(el=>el.onchange=()=>{p.plans.find(v=>v.id===el.dataset.homeDuration).duration=Number(el.value);changed();});
  app.querySelectorAll('[data-home-frame]').forEach(el=>el.onchange=async()=>{const v=p.plans.find(v=>v.id===el.dataset.homeFrame);v.imageIds=el.value?[el.value]:[];v.mapping='common';dirty();try{await save();plans();}catch(e){toast(e.message);}});
  app.querySelectorAll('[data-home-upload-frame]').forEach(b=>b.onclick=()=>ctx.upload(async a=>{const v=p.plans.find(v=>v.id===b.dataset.homeUploadFrame);v.imageIds=[a.id];v.mapping='common';dirty();await save();ctx.rerender();}));
  app.querySelectorAll('[data-home-generate]').forEach(b=>b.onclick=async()=>{try{b.disabled=true;await save();const v=p.plans.find(v=>v.id===b.dataset.homeGenerate);if(v.count>30)throw Error('一次最多准备30张护理底图，请减少数量或上传可共用的完整护理图');const task=await post('/studio/images',{projectId:p.id,planId:v.id,count:v.count,requestId:crypto.randomUUID()});localStorage.setItem('studio:home-photo-image:'+p.id,task.id);poll();}catch(e){toast(e.message);b.disabled=false;}});
 }
 function settings(){
  $('homePhotoSettings').innerHTML=generationSettingsMarkup(routes,choice,esc);const r=routes.find(r=>r.id===choice.videoRoute);$('modelDurationHint').textContent=r?'支持时长：'+durations(r.id).join('、')+'秒。':'请先配置生成服务。';
  for(const [id,key]of [['projectVideoRoute','videoRoute'],['projectVideoModel','videoRoute'],['projectRatio','ratio'],['projectResolution','resolution'],['projectReferenceMode','referenceMode']])$(id).onchange=async e=>{choice[key]=e.target.value;const r=routes.find(r=>r.id===choice.videoRoute);if(key==='videoRoute'&&!r.resolutions.includes(choice.resolution))choice.resolution=r.resolutions[0];for(const v of p.plans){Object.assign(v,{...choice,ratio:choice.ratio==='auto'?v.ratio:choice.ratio,autoRatio:choice.ratio==='auto'});if(!durations(r.id).includes(v.duration))v.duration=durations(r.id)[0];}dirty();try{await save();settings();plans();}catch(err){toast(err.message);}};
 }
 const addRole=async(key,id)=>{p.materials[key]||=[];if(p.materials[key].length>=12)throw Error('每类最多12张图片，请先移除不需要的图片');if(!p.materials[key].includes(id))p.materials[key].push(id);dirty();await save();ctx.rerender();};
 app.querySelectorAll('[data-home-upload]').forEach(b=>b.onclick=()=>ctx.upload(a=>addRole(b.dataset.homeUpload,a.id).catch(e=>toast(e.message))));
 app.querySelectorAll('[data-home-pick]').forEach(b=>b.onclick=()=>ctx.pickAsset(id=>addRole(b.dataset.homePick,id).catch(e=>toast(e.message))));
 app.querySelectorAll('[data-home-preview]').forEach(b=>b.onclick=()=>ctx.modal('<h2>素材预览</h2><img class="big-preview" src="'+esc(asset(b.dataset.homePreview)?.previewUrl||'')+'" alt="家庭与人物素材">'));app.querySelectorAll('[data-home-remove]').forEach(b=>b.onclick=async()=>{try{const [key,id]=b.dataset.homeRemove.split(':');p.materials[key]=p.materials[key].filter(v=>v!==id);dirty();await save();ctx.rerender();}catch(e){toast(e.message);}});$('homePhotoScene').onchange=e=>{p.massageSpec.homeScene=e.target.value;changed();};$('homePhotoPeople').oninput=e=>{p.peopleBrief=e.target.value;changed();};$('homePhotoBrand').oninput=e=>{p.massageSpec.brandText=e.target.value;changed();};
 async function produce(){if(busy)return;busy=true;$('homePhotoGenerate').disabled=true;try{await save();const task=await post('/studio/projects/'+p.id+'/generate-video',{trial:false,prepareImages:false,requestId:crypto.randomUUID()});localStorage.setItem('studio:home-photo-video:'+p.id,task.id);poll();}catch(e){busy=false;$('homePhotoGenerate').disabled=false;$('homePhotoProgress').textContent=e.message;toast(e.message);}}
 $('homePhotoGenerate').onclick=()=>produce();
 let signature='';
 async function poll(){
  if(renderHomeMassageStudio.token!==token||!$('homePhotoProgress'))return;clearTimeout(renderHomeMassageStudio.timer);
  try{
   const imageId=localStorage.getItem('studio:home-photo-image:'+p.id),videoId=localStorage.getItem('studio:home-photo-video:'+p.id);
   const imageTask=imageId?await api('/studio/image-tasks/'+imageId):null,videoTask=videoId?await api('/studio/video-productions/'+videoId):null,jobs=(await api('/studio/works')).filter(j=>j.projectId===p.id);
   if(renderHomeMassageStudio.token!==token||!$('homePhotoProgress'))return;
   busy=videoTask?.status==='preparing'||jobs.some(j=>['queued','waiting','running','submitting'].includes(j.status));$('homePhotoGenerate').disabled=busy;
   $('homePhotoProgress').textContent=videoTask?.status==='error'?'视频制作失败：'+videoTask.error:videoTask?.status==='preparing'?'正在准备内容，完成后自动生成视频…':busy?'视频正在生成…':imageTask?.status==='running'?'护理底图正在生成…':imageTask?.status==='error'?'护理底图生成失败：'+(imageTask.error||'请重试'):jobs.length?'视频结果已更新。':'准备好护理底图后，按所选数量生成视频。';
   if(imageTask?.status==='complete'&&$('homePhotoCandidates').dataset.task!==imageTask.id){
    data=await api('/studio');$('homePhotoCandidates').dataset.task=imageTask.id;const ids=imageTask.result?.imageIds||[];
    $('homePhotoCandidates').innerHTML=`<h3>检查护理底图</h3><div class="thumbs">${ids.map(id=>`<img src="${esc(asset(id)?.previewUrl||'')}" alt="待采用护理底图">`).join('')}</div><button id="adoptHomeFrames" class="primary">采用这些底图</button>`;
    $('adoptHomeFrames').onclick=async()=>{try{for(const id of ids)await api('/studio/assets/'+id,{method:'PATCH',body:{confirmed:true}});const plan=p.plans.find(v=>v.id===imageTask.planId);if(!plan)throw Error('原模板已移除');plan.imageIds=ids;plan.mapping=ids.length>=plan.count?'one-to-one':'common';dirty();await save();localStorage.removeItem('studio:home-photo-image:'+p.id);ctx.rerender();}catch(e){toast(e.message);}};
   }
   const next=JSON.stringify(jobs.map(j=>[j.id,j.status,j.outputs,j.error]));if(next!==signature){signature=next;const sample=[...jobs].reverse().find(j=>j.isTrial&&j.status==='complete'&&j.outputs?.length);
    $('homePhotoVideos').innerHTML=`<div class="project-video-grid">${[...jobs].reverse().map(j=>`<article class="card">${j.status==='complete'&&j.outputs?.length?`<video controls preload="none" src="/api/video/${j.id}?preview=1"></video>`:`<p>${esc(j.error||j.status)}</p>`}<div class="body"><strong>${esc(j.templateName)}</strong><details><summary>查看生成内容</summary><p>${esc(j.prompt)}</p></details></div></article>`).join('')}</div>`;
   }
   renderHomeMassageStudio.timer=setTimeout(poll,4000);
  }catch(e){if(renderHomeMassageStudio.token===token&&$('homePhotoProgress')){$('homePhotoProgress').textContent='无法更新进度：'+e.message;renderHomeMassageStudio.timer=setTimeout(poll,6000);}}
 }
 plans();settings();poll();
}
