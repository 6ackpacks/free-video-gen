import {generationSettingsMarkup} from './video-settings.js';
import {DISPLAY_FORMATS,promotionCategory,displayFormat} from './promotion-model.js';

const $=id=>document.getElementById(id);
let refreshTimer,renderVersion=0;
const statuses={complete:'已完成',queued:'排队中',waiting:'正在生成视频',running:'正在生成视频',submitting:'正在提交视频',needs_review:'提交结果待核对',error:'生成失败',cancelled:'已取消'};

export function renderPromotionStudio(ctx){
  const version=++renderVersion;clearTimeout(refreshTimer);
  const {project:p,app,esc,post,api,toast}=ctx;
  let data=ctx.data,category=promotionCategory(p),formats=DISPLAY_FORMATS[category],busy=false;
  document.querySelector('.bottom')?.remove();
  if(!$('promotionStyle')){const link=document.createElement('link');link.id='promotionStyle';link.rel='stylesheet';link.href='/promotion-ui.css';document.head.append(link);}
  p.promotion={enabled:true,...p.promotion};p.promotion.enabled=true;p.videoDirection='';
  p.materials||={productImageIds:[],sceneImageIds:[],personImageIds:[]};
  for(const key of ['productImageIds','sceneImageIds','personImageIds'])p.materials[key]||=[];
  const previousFrame=p.commonImageId||p.plans[0]?.imageIds?.[0];
  if(!p.materials.sceneImageIds.length&&previousFrame&&data.assets.some(v=>v.id===previousFrame))p.materials.sceneImageIds.push(previousFrame);
  p.promotion.name||=p.productBrief?.name||p.brandName||'';
  p.promotion.sellingPoints||=p.productBrief?.sellingPoints||p.contentBrief||'';
  p.promotion.copy||=p.productBrief?.script||'';
  const originalIds=['space','detail','pov'];
  p.plans.forEach((plan,i)=>{plan.displayFormat||=(category==='environment'?originalIds: ['intro','process','benefit'])[i%3];});
  const type=data.templateTypes.find(t=>t.id===p.templateTypeId);
  app.className='promotion-studio';
  $('breadcrumb').textContent='项目 / '+p.name+' / '+(category==='environment'?'环境展示':'服务展示');
  const field=(key,label,hint,large=false)=>`<label class="field">${label}${large?`<textarea data-promotion-field="${key}" placeholder="${esc(hint)}">${esc(p.promotion[key]||'')}</textarea>`:`<input data-promotion-field="${key}" placeholder="${esc(hint)}" value="${esc(p.promotion[key]||'')}">`}</label>`;
  const role=(key,label,hint)=>`<section class="promotion-role"><div class="section-heading"><h3>${label}</h3><span class="muted">${hint}</span></div><div class="role-thumbs">${(p.materials[key]||[]).map(id=>{const a=data.assets.find(a=>a.id===id);return `<div><button data-preview-asset="${esc(id)}" aria-label="查看${esc(a?.name||label)}"><img src="${esc(a?.previewUrl||'')}" alt="${esc(a?.name||'素材已不存在')}"></button><button data-remove-role="${key}" data-asset="${esc(id)}" aria-label="移除${esc(a?.name||label)}">×</button></div>`;}).join('')}</div><div class="row"><button data-upload-role="${key}">＋ 上传${label}</button><button data-pick-role="${key}">从我的素材选择</button></div></section>`;
  app.innerHTML=`<div class="chooser-heading"><div><span class="eyebrow">宣传视频制作</span><h1>${esc(p.name)}</h1><p>填一次宣传资料，保存为预设。换表现模板，先看一条样片，再制作整套。</p></div><a class="button" href="/projects?project=${encodeURIComponent(p.id)}">项目素材与作品</a></div>
    <div class="project-flow"><strong>① 宣传预设与模板</strong><i></i><span>② 看样片</span><i></i><span>③ 生成剩余视频</span></div>
    <section class="card promotion-presets"><div><h2>宣传预设</h2><p class="muted">保存这家店／这个产品的图片、人物、卖点与宣传文字；环境和服务展示都能复用。</p></div><div class="row"><select id="promotionPreset" aria-label="选择宣传预设"><option value="">选择已保存预设</option></select><button id="applyPromotionPreset">使用预设</button><button id="savePromotionPreset">保存为预设</button></div></section>
    <div class="promotion-columns"><section class="card promotion-inputs"><h2>这次宣传什么</h2>${field('name','宣传主体名称','例如：XX门店、肩颈放松服务、XX新品')}${field('sellingPoints','需要重点展示的内容','例如：独立包间、柔和灯光；或服务步骤、产品材质。只填真实信息。',true)}${field('copy','宣传文字（选填）','填写必须保留的宣传内容；留空时按卖点自动组织文案。',true)}
      ${category==='service'?field('serviceProcess','服务／使用步骤（选填）','例如：咨询需求 → 准备用品 → 展示操作。过程模板优先取其中一个关键步骤。',true):''}
      ${role('sceneImageIds','环境图',category==='environment'?'必填，固定真实空间':'选填，提供服务场所')}${role('productImageIds','产品／服务图',category==='service'?'产品、工具、服务过程都可':'选填，展示设施或产品细节')}${role('personImageIds','人物图','人物模板选填，保持同一人物身份')}
      ${field('personRole','人物身份与形象（选填）','例如：同一位成年门店工作人员，自然介绍；顾客与工作人员对话')}
      <details class="detail-block"><summary>受众、收尾与活动信息</summary>${field('audience','宣传对象','例如：附近上班族、家庭顾客')}${field('cta','希望观众做什么','例如：预约体验、到店了解')}${field('voice','声音要求','例如：自然清晰的中文，温和语气')}<div class="promotion-date-row"><label class="field">活动开始日期<input type="date" data-promotion-field="startDate" value="${esc(p.promotion.startDate||'')}"></label><label class="field">活动结束日期<input type="date" data-promotion-field="endDate" value="${esc(p.promotion.endDate||'')}"></label></div><p class="muted">日期选填，用于活动文案；不是监控时间戳，也不会自动安排发布。</p></details>
    </section><section class="card promotion-templates"><h2>${category==='environment'?'环境':'服务'}怎么展示</h2><p class="muted">模板决定镜头与讲述方式，所有模板复用左侧资料。</p><div id="promotionFormats"></div><section id="promotionSettings" class="project-generation-settings"></section><section class="promotion-first-frame"><h3>底图与素材分配</h3><p class="muted">多图分别提供环境、产品和人物。首帧模式只使用选定起始图；需要不同画面时可单独准备。</p><div id="promotionFrames"></div></section><label class="field">先看哪一条<select id="promotionSampleSlot" aria-label="选择样片"></select></label><button id="promotionSample" class="primary wide">生成一条样片</button><p class="muted">点击后自动准备内容并生成视频，无需确认提示词。</p></section></div>
    <section class="card promotion-results"><div class="section-heading"><h2>样片与整套视频</h2><a class="button" href="/works?project=${encodeURIComponent(p.id)}">全部作品与执行记录</a></div><div id="promotionProgress" role="status" aria-live="polite">尚未开始，确认资料后生成一条样片。</div><div id="promotionVideos"></div></section>`;
  let saveTimer;
  const dirty=()=>{for(const v of p.plans){v.promptsDirty=true;v.scriptConfirmed=false;}};
  const save=async()=>{clearTimeout(saveTimer);const saved=await ctx.save();Object.assign(p,saved);return saved;};
  const later=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>toast(e.message)),450);};
  const change=()=>{dirty();later();};
  const base=()=>category==='environment'?p.materials.sceneImageIds[0]:p.materials.productImageIds[0]||p.materials.sceneImageIds[0];
  const routes=data.routes.filter(r=>r.configured&&r.referenceMode==='reference-image'&&!r.audioDriven);
  let stored={};try{stored=JSON.parse(localStorage.getItem('studio:generationPreset')||'{}');}catch{}
  const initialRoute=routes.find(r=>r.id===p.plans[0]?.videoRoute)||routes.find(r=>r.id===stored.videoRoute)||routes.find(r=>r.id==='doubao')||routes[0];
  const selection={videoRoute:initialRoute?.id||'',resolution:p.plans[0]?.resolution||initialRoute?.resolutions[0]||'',ratio:p.plans[0]?.autoRatio?'auto':p.plans[0]?.ratio||'9:16',referenceMode:p.plans[0]?.referenceMode||'reference-image'};
  const route=()=>routes.find(r=>r.id===selection.videoRoute);
  const durationList=r=>r?.duration?.values||Array.from({length:Math.max(0,Math.min(r?.duration?.max||15,15)-(r?.duration?.min||5)+1)},(_,i)=>i+(r.duration.min||5));
  const options=(values,selected)=>values.map(v=>`<option value="${esc(v.id??v)}" ${(v.id??v)===selected?'selected':''}>${esc(v.name??v)}</option>`).join('');
  function renderPlans(){
    $('promotionFormats').innerHTML=formats.map((format,i)=>{const plan=p.plans.find(v=>v.displayFormat===format.id);return `<article class="promotion-format ${plan?'selected':''}"><label><input type="checkbox" data-display-format="${format.id}" ${plan?'checked':''}><span><strong>${format.name}</strong><small>${format.summary}</small></span></label>${plan?`<div class="row"><label>数量 <input type="number" min="1" max="100" value="${plan.count}" data-display-count="${plan.id}" aria-label="${format.name}数量"></label><label>时长 <select data-display-duration="${plan.id}" aria-label="${format.name}时长">${options(durationList(data.routes.find(r=>r.id===plan.videoRoute)),plan.duration)}</select> 秒</label></div>`:''}</article>`;}).join('');
    $('promotionSampleSlot').innerHTML=p.plans.map(v=>`<option value="${v.id}">${esc(displayFormat(category,v.displayFormat).name)} · 第1条</option>`).join('');
    const initial=p.plans[0];
    renderFrames();$('promotionSample').disabled=busy||!p.plans.length;
    document.querySelectorAll('[data-display-format]').forEach(el=>el.onchange=()=>{
      if(el.checked){const format=displayFormat(category,el.dataset.displayFormat),template=data.templates.find(t=>t.id===type.actionIds[formats.findIndex(f=>f.id===format.id)%type.actionIds.length]),r=route();if(!template||!r){el.checked=false;toast('请先配置可用生成服务');return;}
        p.plans.push({id:crypto.randomUUID(),templateId:template.id,snapshot:{...template,name:format.name,description:format.rule,actions:[format.rule]},displayFormat:format.id,count:1,duration:durationList(r).includes(template.duration)?template.duration:durationList(r)[0],videoRoute:r.id,resolution:selection.resolution,ratio:selection.ratio==='auto'?'9:16':selection.ratio,referenceMode:selection.referenceMode,autoRatio:selection.ratio==='auto',mapping:'common',imageIds:base()?[base()]:[],rows:[],shotImages:[],creativeBrief:'',prompts:[],promptsDirty:true});
      }else p.plans=p.plans.filter(v=>v.displayFormat!==el.dataset.displayFormat);
      change();renderPlans();renderSettings();
    });
    document.querySelectorAll('[data-display-count]').forEach(el=>el.onchange=()=>{const n=Number(el.value);if(!Number.isInteger(n)||n<1||n>100){toast('数量须为1–100');el.value=1;return;}p.plans.find(v=>v.id===el.dataset.displayCount).count=n;change();});
    document.querySelectorAll('[data-display-duration]').forEach(el=>el.onchange=()=>{p.plans.find(v=>v.id===el.dataset.displayDuration).duration=Number(el.value);change();});
  }
  function renderFrames(){
    $('promotionFrames').innerHTML=p.plans.map(plan=>{const a=data.assets.find(v=>v.id===plan.imageIds?.[0]);return `<div class="promotion-frame-row">${a?`<img src="${esc(a.previewUrl)}" alt="${esc(a.name)}">`:''}<span>${esc(displayFormat(category,plan.displayFormat).name)}<small>${esc(a?.name||'上传资料后自动绑定起始图')}</small></span><button data-pick-frame="${plan.id}">选择起始图</button></div>`;}).join('');
    document.querySelectorAll('[data-pick-frame]').forEach(el=>el.onclick=()=>ctx.pickAsset(async id=>{const plan=p.plans.find(v=>v.id===el.dataset.pickFrame);plan.imageIds=[id];plan.mapping='common';change();renderFrames();}));
  }
  function renderSettings(){
    $('promotionSettings').innerHTML=generationSettingsMarkup(routes,selection,esc);
    const r=route();$('modelDurationHint').textContent=r?`支持时长：${r.duration.values?r.duration.values.join('、'):r.duration.min+'–'+r.duration.max}秒。${r.id==='doubao'?'画质由豆包服务决定。':''}`:'请先配置可用的视频生成服务。';
    for(const [id,key]of [['projectVideoRoute','videoRoute'],['projectVideoModel','videoRoute'],['projectRatio','ratio'],['projectResolution','resolution'],['projectReferenceMode','referenceMode']])$(id).onchange=async e=>{
      selection[key]=e.target.value;const next=route();
      if(key==='videoRoute')localStorage.removeItem('studio:promotion:'+p.id);
      if(key==='videoRoute')selection.resolution=next.resolutions.includes(selection.resolution)?selection.resolution:next.resolutions.includes('720P')?'720P':next.resolutions[0];
      for(const v of p.plans){v.videoRoute=selection.videoRoute;v.resolution=selection.resolution;v.referenceMode=selection.referenceMode;v.autoRatio=selection.ratio==='auto';if(!v.autoRatio)v.ratio=selection.ratio;if(!durationList(next).includes(v.duration))v.duration=durationList(next)[0];}
      localStorage.setItem('studio:generationPreset',JSON.stringify(selection));dirty();
      try{await save();renderSettings();renderPlans();}catch(error){toast(error.message);}
    };
  }
  async function resolveImageRatios(){
    if(selection.ratio!=='auto')return;
    for(const plan of p.plans){const a=data.assets.find(v=>v.id===plan.imageIds?.[0]);if(!a?.previewUrl)continue;
      const size=await new Promise(resolve=>{const img=new Image(),timer=setTimeout(()=>resolve(null),5000);img.onload=()=>{clearTimeout(timer);resolve([img.naturalWidth,img.naturalHeight]);};img.onerror=()=>{clearTimeout(timer);resolve(null);};img.src=a.previewUrl;});
      if(!size)throw Error('无法读取底图比例，请重试或手动选择画面比例');
      const [w,h]=size;plan.ratio=Math.abs(w-h)/Math.max(w,h)<.08?'1:1':w>h?'16:9':'9:16';plan.autoRatio=true;
    }
  }
  const applyAsset=async(key,id)=>{if(busy)return;p.materials[key]||=[];if(p.materials[key].length>=12)throw Error('每类最多12张');if(!p.materials[key].includes(id))p.materials[key].push(id);for(const v of p.plans)if(!v.imageIds?.length&&base())v.imageIds=[base()];p.commonImageId||=base()||'';dirty();await save();await ctx.rerender();};
  document.querySelectorAll('[data-promotion-field]').forEach(el=>el.oninput=()=>{p.promotion[el.dataset.promotionField]=el.value;change();});
  document.querySelectorAll('[data-upload-role]').forEach(el=>el.onclick=()=>ctx.uploadAsset(ref=>applyAsset(el.dataset.uploadRole,ref.id).catch(e=>toast(e.message))));
  document.querySelectorAll('[data-pick-role]').forEach(el=>el.onclick=()=>ctx.pickAsset(id=>applyAsset(el.dataset.pickRole,id).catch(e=>toast(e.message))));
  document.querySelectorAll('[data-remove-role]').forEach(el=>el.onclick=async()=>{const key=el.dataset.removeRole,id=el.dataset.asset;p.materials[key]=p.materials[key].filter(v=>v!==id);for(const v of p.plans)if(v.imageIds?.[0]===id)v.imageIds=base()?[base()]:[];if(p.commonImageId===id)p.commonImageId=base()||'';dirty();try{await save();await ctx.rerender();}catch(e){toast(e.message);}});
  document.querySelectorAll('[data-preview-asset]').forEach(el=>el.onclick=()=>{const a=data.assets.find(v=>v.id===el.dataset.previewAsset);ctx.modal(`<h2>${esc(a?.name||'素材')}</h2><img class="big-preview" src="${esc(a?.previewUrl||'')}" alt="素材大图">`);});
  async function loadPresets(){const items=await api('/studio/promotion-presets');if(version!==renderVersion)return;$('promotionPreset').innerHTML='<option value="">选择已保存预设</option>'+options(items.filter(v=>v.industryId===p.industryId),p.promotionPresetId);}
  $('applyPromotionPreset').onclick=async()=>{try{const id=$('promotionPreset').value;if(!id)throw Error('请先选择宣传预设');await save();Object.assign(p,await post('/studio/promotion-presets/'+id+'/apply',{projectId:p.id}));await ctx.rerender();toast('预设已载入，选择表现模板即可生成样片');}catch(e){toast(e.message);}};
  $('savePromotionPreset').onclick=()=>{ctx.modal(`<h2>保存宣传预设</h2><label class="field">预设名称<input id="promotionPresetName" maxlength="100" value="${esc(p.promotion.name||p.name)}"></label><p>保存宣传图片、人物、卖点、文案和活动信息。以后可用于环境或服务展示。</p><button id="confirmSavePromotionPreset" class="primary">保存预设</button>`);$('confirmSavePromotionPreset').onclick=async()=>{try{await save();const preset=await post('/studio/promotion-presets',{projectId:p.id,name:$('promotionPresetName').value});p.promotionPresetId=preset.id;p.promotionPresetVersion=preset.version;await save();ctx.closeModal();await loadPresets();toast('宣传预设已保存');}catch(e){toast(e.message);}};};
  function lock(value){busy=value;app.querySelectorAll('.promotion-inputs input,.promotion-inputs textarea,.promotion-inputs button,.promotion-presets button,.promotion-presets select,.promotion-templates input,.promotion-templates select,.promotion-templates button').forEach(el=>el.disabled=value);$('promotionSample').disabled=value||!p.plans.length;}
  async function produce(mode,jobId){if(busy)return;lock(true);try{await resolveImageRatios();await save();const task=await post('/studio/projects/'+p.id+'/produce',{mode,jobId,planId:$('promotionSampleSlot').value,requestId:crypto.randomUUID()});localStorage.setItem('studio:promotion:'+p.id,task.id);await updateResults();}catch(e){lock(false);$('promotionProgress').textContent='未开始制作：'+e.message;toast(e.message);}}
  $('promotionSample').onclick=()=>produce('sample');
  async function updateResults(){
    if(version!==renderVersion||!app.isConnected)return;clearTimeout(refreshTimer);
    try{
      const id=localStorage.getItem('studio:promotion:'+p.id),task=id?await api('/studio/productions/'+id):null,jobs=(await api('/studio/works')).filter(j=>j.projectId===p.id);
      if(version!==renderVersion)return;
      const active=jobs.some(j=>!['complete','error','cancelled','needs_review'].includes(j.status));lock(task?.status==='preparing'||active);
      const ready=jobs.filter(j=>j.status==='complete'&&j.outputs?.length),sample=[...ready].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).find(j=>j.isTrial),remaining=Math.max(0,p.plans.reduce((n,v)=>n+v.count,0)-1);
      $('promotionProgress').textContent=task?.status==='error'?(task.failureStage==='video-submit'?'视频提交失败：':'上次内容准备失败，视频尚未提交：')+task.error:task?.status==='preparing'?'正在准备视频内容，完成后自动开始生成视频…':active?'视频正在生成，完成后会在这里显示。':ready.length?`已完成 ${ready.length} 条视频，可播放检查效果。`:jobs.some(j=>j.status==='needs_review')?'提交结果待核对，请在执行记录中关联已有任务。':'尚未开始，确认资料后生成一条样片。';
      // Keep existing players mounted while polling so playback is never reset.
      const signature=JSON.stringify(jobs.map(j=>[j.id,j.status,j.error,j.outputs]));
      if($('promotionVideos').dataset.signature!==signature){$('promotionVideos').dataset.signature=signature;$('promotionVideos').innerHTML=`${sample?`<div class="promotion-review"><strong>检查样片后决定是否继续</strong><button id="promotionRemaining" class="primary" ${!remaining||active?'disabled':''}>${remaining?'满意，生成剩余 '+remaining+' 条':'只有一条，样片即成品'}</button><button id="promotionAdjust">调整资料或这条视频</button></div>`:''}<div class="project-video-grid">${[...jobs].reverse().map(j=>`<article class="card project-video-card">${j.status==='complete'&&j.outputs?.length?`<video controls playsinline preload="none" src="/api/video/${encodeURIComponent(j.id)}?preview=1"></video>`:`<div class="empty">${esc(statuses[j.status]||j.status)}${j.error?`<p>${esc(j.error)}</p>`:''}</div>`}<div class="body"><strong>${esc(j.templateName||'视频')}${j.isTrial?' · 样片':''}</strong>${j.status==='complete'&&j.outputs?.length?`<a class="button" href="/api/video/${encodeURIComponent(j.id)}?download=1">下载视频</a>`:''}${j.status==='error'?`<button data-retry-video="${j.id}">重试失败项</button>`:''}<details class="detail-block" ${j.status === 'complete' ? '' : 'hidden'}><summary>查看生成详情与提示词</summary><textarea data-video-prompt="${j.id}" aria-label="视频提示词">${esc(j.prompt||'')}</textarea>${j.isTrial?`<button data-save-video-prompt="${j.id}">保存修改并重新生成样片</button>`:''}</details></div></article>`).join('')}</div>`;
        if($('promotionRemaining'))$('promotionRemaining').onclick=()=>produce('remaining',sample.id);
        if($('promotionAdjust'))$('promotionAdjust').onclick=()=>{document.querySelector('.promotion-inputs').scrollIntoView({behavior:'smooth'});toast('修改宣传资料或展开生成详情，完成后重新生成一条样片。');};
        document.querySelectorAll('[data-retry-video]').forEach(el=>el.onclick=async()=>{try{el.disabled=true;await post('/studio/jobs/'+el.dataset.retryVideo+'/retry',{});await updateResults();}catch(e){toast(e.message);el.disabled=false;}});
        document.querySelectorAll('[data-save-video-prompt]').forEach(el=>el.onclick=async()=>{try{const job=jobs.find(v=>v.id===el.dataset.saveVideoPrompt),current=await api('/studio/projects/'+p.id),plan=current.plans.find(v=>v.id===job.planId);if(!plan||current.plans.some(v=>v.promptsDirty))throw Error('宣传资料已变更，请先重新生成样片');const textarea=document.querySelector(`[data-video-prompt="${job.id}"]`);plan.prompts[job.slotIndex]=textarea.value;Object.assign(p,await post('/studio/projects/'+p.id+'/prompts',{slot:{planId:plan.id,index:job.slotIndex,prompt:textarea.value}}));$('promotionSampleSlot').value=plan.id;await produce('sample');}catch(e){toast(e.message);}});
      }
      if($('promotionRemaining'))$('promotionRemaining').disabled=busy||!remaining||jobs.some(j=>!j.isTrial&&j.status!=='cancelled');
      refreshTimer=setTimeout(updateResults,4000);
    }catch(e){if(version===renderVersion){$('promotionProgress').textContent='无法更新进度：'+e.message;refreshTimer=setTimeout(updateResults,6000);}}
  }
  renderPlans();renderSettings();loadPresets().catch(e=>toast(e.message));updateResults();
}
