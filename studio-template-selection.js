import {templateArtwork} from './template-art.js';
import {DISPLAY_FORMATS,promotionCategory} from './promotion-model.js';

export function sharedStep(project){return new URLSearchParams(location.search).get('step')||localStorage.getItem('studio:step:'+project.id)||(project.plans.length?'production':'templates');}
export function sharedStepBar(step){return `<div class="studio-stepbar shared-stepbar"><button data-shared-step="templates" class="${step==='templates'?'current':'done'}"><b>${step==='templates'?'1':'✓'}</b>选择模板</button><span>→</span><button data-shared-step="production" class="${step==='production'?'current':''}"><b>2</b>底图与视频</button></div>`;}
export function renderSharedTemplateSelection(ctx){
 const {project:p,data,app,esc,save,toast}=ctx,type=data.templateTypes.find(t=>t.id===p.templateTypeId),category=promotionCategory(p);
 const originals=(type?.actionIds||[]).map(id=>data.templates.find(t=>t.id===id)).filter(Boolean);
 if(p.templateTypeId==='massage:service')originals.sort((a,b)=>Number(!a.actionId?.startsWith('home-pov'))-Number(!b.actionId?.startsWith('home-pov')));
 const formats=DISPLAY_FORMATS[category];
 const choices=formats?formats.map((f,i)=>({key:f.id,format:f,template:originals[i%originals.length],name:f.name,description:f.summary||f.rule})):originals.map(t=>({key:t.id,template:t,name:t.name,description:t.description}));
 if(formats)for(const plan of p.plans)plan.displayFormat||=plan.snapshot.serviceRecipeId||formats[originals.findIndex(t=>t.id===plan.templateId)%formats.length]?.id||formats[0].id;
 const isSelected=c=>p.plans.some(v=>formats?v.displayFormat===c.key:v.templateId===c.key);
 let query='';app.className='monitor-studio shared-template-selection';
 const sceneFields=p.templateTypeId==='massage:service'?`<section class="card shared-scene-choice"><h2>先选择上门服务环境</h2><label class="field">家庭场景<select id="homeSceneChoice"><option value="sofa" ${p.massageSpec?.homeScene!=='bed'?'selected':''}>普通家庭客厅 · 沙发</option><option value="bed" ${p.massageSpec?.homeScene==='bed'?'selected':''}>普通家庭卧室 · 床边</option></select></label><p class="muted">照片采用真实手机随手拍质感；足部护理使用顾客第一人称视角。</p></section>`:'';
 app.innerHTML=`<a class="button text-button" href="/templates">‹ 返回模板中心</a>${sharedStepBar('templates')}<div class="studio-page-title"><h1>选择${esc(type?.name||'动作')}模板</h1><p>先选择想制作的样式，再到下一步上传底图、设置内容并生成视频。</p></div>${sceneFields}<div class="studio-select-layout"><section><div class="studio-filters"><input id="sharedTemplateSearch" placeholder="搜索模板或动作" aria-label="搜索模板"></div><div id="sharedTemplateCards" class="studio-action-grid"></div></section><aside class="studio-selected-panel"><h2>已选模板 <span id="sharedSelectedCount"></span></h2><div id="sharedSelectedPlans"></div><p class="muted">下一步设置底图、人物、数量、时长及生成模型。</p><button id="sharedContinue" class="primary wide">下一步：底图与视频 →</button></aside></div>`;
 app.querySelectorAll('[data-shared-step]').forEach(b=>b.onclick=()=>{if(b.dataset.sharedStep==='production')go();});
 const references=c=>c.template?.referenceClips||[];
 const ref=c=>references(c).find(v=>v.videoUrl)||references(c)[0];
 function draw(){
  const filtered=choices.filter(c=>c.template&&(c.name+c.description).includes(query));
  $('sharedTemplateCards').innerHTML=filtered.map(c=>{const r=ref(c);return `<article class="studio-action-card ${isSelected(c)?'selected':''}"><label class="studio-check"><input type="checkbox" data-shared-template="${esc(c.key)}" aria-label="选择${esc(c.name)}" ${isSelected(c)?'checked':''}></label>${r?.videoUrl?`<button class="studio-action-preview" data-shared-preview="${esc(c.key)}"><img src="${esc(r.posterUrl||templateArtwork(c.template))}" alt="${esc(c.name)}原片参考"><span class="studio-play">▶</span><small>原片参考</small></button>`:`<div class="studio-action-missing visual-action-illustration"><img src="${templateArtwork({...c.template,categoryId:category||type?.categoryId})}" alt="${esc(c.name)}方向示意，非原片"><small>${r?.source?.url?'原作链接已提供 · 本地原片待导入':'方向示意 · 原片参考待补充'}</small></div>`}<h3>${esc(c.name)}</h3><p class="shared-template-description">${esc(c.description)}</p><div class="studio-card-actions">${r?.videoUrl?`<button data-shared-preview="${esc(c.key)}">播放参考</button>`:''}${r?.source?.url?`<a href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">查看原始视频 ↗</a>`:''}<button data-shared-rules="${esc(c.key)}">查看模板内容</button></div></article>`;}).join('')||'<p>没有匹配的模板。</p>';
  app.querySelectorAll('[data-shared-template]').forEach(el=>el.onchange=async()=>{
   const c=choices.find(c=>c.key===el.dataset.sharedTemplate);
   if(el.checked){const t=c.template,r=data.routes.find(r=>r.id===ctx.choice?.videoRoute&&r.configured)||data.routes.find(r=>r.id==='doubao')||data.routes.find(r=>r.configured);if(!r){toast('请先配置生成服务');el.checked=false;return;}
    p.plans.push({id:crypto.randomUUID(),templateId:t.id,snapshot:{...t,...(c.format?{name:c.name,description:c.format.rule,actions:[c.format.rule]}:{})},displayFormat:c.format?.id||'',count:1,duration:category&&((r.duration?.values||[]).includes(10)||(!r.duration?.values&&r.duration?.min<=10&&r.duration?.max>=10))?10:t.duration,videoRoute:r.id,resolution:ctx.choice?.resolution&&r.resolutions.includes(ctx.choice.resolution)?ctx.choice.resolution:r.resolutions[0],ratio:ctx.choice?.ratio==='auto'?'9:16':ctx.choice?.ratio||'9:16',autoRatio:ctx.choice?.ratio==='auto',referenceMode:t.packId==='home-massage'||c.format?.people?'reference-image':ctx.choice?.referenceMode||'first-frame',mapping:t.mapping||'common',imageIds:t.mapping==='one-to-one'?[]:p.commonImageId?[p.commonImageId]:[],rows:[],shotImages:[],prompts:[],creativeBrief:'',scriptConfirmed:false});
   }else p.plans=p.plans.filter(v=>c.format?v.displayFormat!==c.key:v.templateId!==c.key);
   draw();try{await save();}catch(e){toast(e.message);}
  });
  app.querySelectorAll('[data-shared-preview]').forEach(b=>b.onclick=()=>{const c=choices.find(c=>c.key===b.dataset.sharedPreview),r=ref(c);ctx.modal(`<h2>${esc(c.name)}</h2><video controls class="big-preview" src="${esc(r.videoUrl)}"></video>${r.source?.url?`<a href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">查看原始视频 ↗</a>`:''}`);});
  app.querySelectorAll('[data-shared-rules]').forEach(b=>b.onclick=()=>{const c=choices.find(c=>c.key===b.dataset.sharedRules);ctx.modal(`<h2>${esc(c.name)}</h2><p>${esc(c.format?.rule||c.template.description)}</p><h3>图片要求</h3><p>${esc(c.template.imageRules)}</p>`);});
  $('sharedSelectedCount').textContent=p.plans.length;
  $('sharedSelectedPlans').innerHTML=p.plans.map(v=>`<article><img src="${templateArtwork(v.snapshot)}" alt="方向示意"><strong>${esc(v.snapshot.name)}</strong><button data-shared-remove="${v.id}" aria-label="移除${esc(v.snapshot.name)}">×</button></article>`).join('')||'<p class="muted">勾选左侧模板，组成制作计划。</p>';
  $('sharedContinue').disabled=!p.plans.length;
  app.querySelectorAll('[data-shared-remove]').forEach(b=>b.onclick=async()=>{p.plans=p.plans.filter(v=>v.id!==b.dataset.sharedRemove);draw();try{await save();}catch(e){toast(e.message);}});
 }
 async function go(){if(!p.plans.length){toast('先选择至少一个模板');return;}try{await save();ctx.go('production');}catch(e){toast(e.message);}}
 const $=id=>app.querySelector('#'+id);$('sharedContinue').onclick=go;$('sharedTemplateSearch').oninput=e=>{query=e.target.value;draw();};
 if($('homeSceneChoice'))$('homeSceneChoice').onchange=async e=>{p.massageSpec||={};p.massageSpec.homeScene=e.target.value;for(const v of p.plans)v.promptsDirty=true;try{await save();}catch(error){toast(error.message);}};
 draw();
}
