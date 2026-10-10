(() => {
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${({ grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', film:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>', folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/>', user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>', pen:'<path d="m4 16-1 5 5-1L20 8l-4-4zM13 7l4 4"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>' })[name] || ''}</svg>`;
  const storageKey = 'workbench-layout:v2:' + location.pathname + location.search;
  let activeView = '', frame, tabs, statusline, panes = {}, toastTimer;
  let libraryState = { favorite: [], hidden: [], presets: [] };
  function localRead() { try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; } }
  function remember(extra) { try { localStorage.setItem(storageKey, JSON.stringify({ ...localRead(), ...extra })); } catch { toast('工作区布局未保存，请检查浏览器存储空间。'); } }
  function toast(message) { let el = byId('wbToast'); if (!el) { el = document.createElement('div'); el.id='wbToast'; el.className='wb-toast'; el.setAttribute('role','status'); document.body.append(el); } el.textContent=message; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.hidden=true,4000); }
  async function request(url, options={}) { const r=await fetch('/api'+url,{...options,headers:{'Content-Type':'application/json'}}); const data=await r.json(); if(!r.ok)throw Error(data.error||'请求失败'); return data; }
  function show(view, persist=true) { if(!panes[view])return; activeView=view;if(frame)frame.dataset.view=view; for(const [id,pane] of Object.entries(panes))pane.hidden=id!==view; for(const button of tabs.querySelectorAll('[data-view]'))button.setAttribute('aria-selected',String(button.dataset.view===view)); if(persist)remember({view});document.dispatchEvent(new CustomEvent('workbench:view',{detail:{view}})); }
  function panel(title, className) { const el=document.createElement('section');el.className='wb-column '+className;el.setAttribute('aria-label',title);return el; }
  function empty(title, description) { const el=document.createElement('div');el.className='wb-empty';el.innerHTML=icon('film')+`<strong>${esc(title)}</strong><p>${esc(description)}</p>`;return el; }
  function pane(id, label, nodes, description) {
    const el=document.createElement('section');el.id='wbPane-'+id;el.className='wb-view';el.setAttribute('role','tabpanel');el.setAttribute('aria-label',label);nodes.filter(Boolean).forEach(n=>el.append(n));
    const placeholder=empty(label,description);el.append(placeholder);panes[id]=el;
    const button=document.createElement('button');button.dataset.view=id;button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',el.id);button.onclick=()=>show(id);tabs.append(button);
    const update=()=>{const populated=[...el.children].some(n=>n!==placeholder&&!n.hidden&&!n.classList.contains('hidden')&&(n.textContent.trim()||n.querySelector('img,video,input')));if(placeholder.hidden!==populated)placeholder.hidden=populated};
    new MutationObserver(update).observe(el,{childList:true,attributes:true,subtree:true,attributeFilter:['class','hidden']});update();return el;
  }
  function collapse(card, closed=false) {
    const head=card?.querySelector(':scope>.head,:scope>.cardhead');if(!head)return;
    const key=card.id||head.querySelector('h2')?.textContent;
    const saved=localRead().collapsed||{};card.classList.toggle('wb-collapsed',saved[key]??closed);
    const button=document.createElement('button');button.className='wb-collapser';button.textContent='⌃';button.setAttribute('aria-label','展开或收起'+(key||'面板'));
    const update=()=>{button.textContent=card.classList.contains('wb-collapsed')?'＋':'−';button.setAttribute('aria-expanded',String(!card.classList.contains('wb-collapsed')))};
    button.onclick=()=>{card.classList.toggle('wb-collapsed');remember({collapsed:{...(localRead().collapsed||{}),[key]:card.classList.contains('wb-collapsed')}});update()};head.append(button);update();
  }
  function dock(column, ids) { const el=document.createElement('div');el.className='wb-bottom';ids.forEach(id=>{const n=byId(id);if(n)el.append(n)});column.append(el);return el; }
  function nav(mode) {
    const el=document.createElement('aside');el.className='wb-nav';el.setAttribute('aria-label','工作台导航');el.innerHTML=`<div class="wb-logo">帧间</div><small>创作工作区</small><a href="/?mode=store" class="${mode==='store'?'active':''}">${icon('grid')}门店视频</a><a href="/?mode=paired" class="${mode==='paired'?'active':''}">${icon('film')}家庭按摩</a><a href="/story" class="${mode==='story'?'active':''}">${icon('pen')}短剧生成</a><a href="/clone" class="${mode==='clone'?'active':''}">${icon('film')}爆款复刻</a><small>管理与复用</small><button id="wbWarehouse">${icon('folder')}我的图片仓库</button><button id="wbLibrary">${icon('folder')}素材与历史</button><button id="wbPresets">${icon('clock')}我的预设</button><a id="wbAccounts" href="/?mode=store&tab=accounts">${icon('user')}豆包账号池</a><div class="wb-nav-footer">本地工作台<br>草稿自动保存 · 结果可复用</div>`;
    document.body.prepend(el);byId('wbWarehouse').onclick=()=>window.ImageWarehouse.open();byId('wbLibrary').onclick=()=>openLibrary();byId('wbPresets').onclick=()=>location.href='/presets';if(mode==='presets')byId('wbPresets').classList.add('active');
    if(byId('accountsPage'))byId('wbAccounts').onclick=e=>{e.preventDefault();document.querySelector('[data-tab="accounts"]')?.click()};
  }
  function createFrame(main) {
    frame=document.createElement('div');frame.className='wb-frame';
    const context=panel('素材与设定','wb-context'),center=document.createElement('section'),compose=panel('生成参数','wb-compose');center.className='wb-main';
    tabs=document.createElement('div');tabs.className='wb-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','工作区视图');center.append(tabs);frame.append(context,center,compose);main.append(frame);
    statusline=document.createElement('div');statusline.className='wb-statusline';statusline.setAttribute('role','status');statusline.innerHTML='<i></i><span>草稿自动保存在本机</span><progress hidden></progress><button>保存本次设置为预设</button>';statusline.querySelector('button').onclick=savePreset;main.append(statusline);
    return {context,center,compose};
  }
  function setupStory() {
    const main=document.querySelector('main.page'),layout=main.querySelector('.layout'),left=layout.querySelector(':scope>aside'),cards=[...left.children],right=layout.querySelector(':scope>div');
    const {context,center,compose}=createFrame(main);cards[0].querySelector('h2').textContent='01 · 宣传主体';context.append(cards[0]);collapse(cards[0]);dock(context,['confirmSubject','contextMessage']);
    const templateCard=cards[1],timeFields=templateCard.querySelector('.cols');cards[3].querySelector('.body').prepend(timeFields);
    compose.append(cards[2],cards[3]);collapse(cards[2],true);const quick=document.createElement('details');quick.className='wb-quick';quick.innerHTML='<summary>快捷生成（跳过提示词审核）</summary>';quick.append(byId('direct'));cards[3].querySelector('.body').append(quick);byId('draft').classList.remove('alt');byId('draft').classList.add('red');dock(compose,['draft','run','draftMessage','runMessage']);
    center.append(pane('templates','选择模板',[templateCard],'先选择宣传主体，再勾选适合的写法。'),pane('prompts','提示词审核',[right.children[0]],'点击“确认模板，生成提示词”后，结果会出现在这里，可选择、修改和删除草稿。'),pane('videos','成片与进度',[byId('jobsCard')],'先生成 1 条试片，试览确认后继续剩余视频。所有成片支持预览与下载。'));
    layout.remove();return 'templates';
  }
  function setupPaired() {
    const main=document.querySelector('main.wrap'),panel=byId('pairedPanel'),grid=panel.querySelector('.grid'),left=grid.querySelector(':scope>aside'),settings=left.children[0],promptCard=grid.querySelector(':scope>div').children[0];
    const {context,center,compose}=createFrame(main);context.append(settings);collapse(settings);dock(context,['previewTuning','promptMessage']);
    compose.append(byId('quantityCard'));const imageCard=byId('imageReviewCard'),body=imageCard.querySelector('.body'),parameterCard=document.createElement('section');parameterCard.className='card';parameterCard.innerHTML='<div class="head"><h2>视频生成参数</h2></div><div class="body"></div>';compose.append(parameterCard);
    const parameterBody=parameterCard.querySelector('.body');for(const id of ['pairRoute','pairResolution'])parameterBody.append(byId(id).closest(id==='pairRoute'?'.cols':'.field'));
    parameterBody.append(imageCard.querySelector('.directionbar'));collapse(parameterCard);
    const confirmDock=dock(compose,['confirmImages','imageMessage']);confirmDock.dataset.needsImages='true';
    center.append(pane('prompts','01 提示词',[promptCard],'在左侧完成设定后，生成整批提示词。你可以只选其中几条生成图片。'),pane('images','02 图片审核',[imageCard],'选用提示词并确认后，开始生成图片。支持放大、修改视频方向和重生成。'),pane('videos','03 成片与进度',[byId('videoBatchCard')],'确认图片后先生成 1 条试片，试览满意后继续剩余视频。所有任务会保存到素材与历史。'));
    panel.remove();return 'prompts';
  }
  function setupStore() {
    const main=byId('studioPage'),workspace=main.querySelector('.workspace'),cards=[...workspace.children],trial=main.querySelector('.trial'),history=main.querySelector('.history');
    const {context,center,compose}=createFrame(main);context.append(cards[0]);collapse(cards[0]);compose.append(cards[2]);cards[2].querySelector('h2').textContent='03 · 生成设置';
    const promptField=byId('promptParts').closest('.field'),promptCard=document.createElement('section');promptCard.className='card';promptCard.innerHTML='<details><summary class="head">查看模板的核心约束</summary><div class="body"></div></details>';promptCard.querySelector('.body').append(promptField,byId('previewPrompt'));
    dock(compose,['generateActionPrompts','createTrial']);center.append(pane('templates','选择动作',[cards[1]],'固定底图后选择兼容动作，可多选或随机轮换。'),pane('prompts','提示词生成',[promptCard],'模板作为生成规则交给大模型，结果可编辑后用于试片。'),pane('videos','成片与进度',[trial],'所选提示词已提交，生成完成后可试览与下载。'),pane('history','生成历史',[history],'历史批次会保留，可继续检查与下载。'));
    workspace.remove();return 'templates';
  }
  function dialog(title) { const d=document.createElement('dialog');d.className='wb-dialog';d.innerHTML=`<div class="wb-dialog-head"><h2>${esc(title)}</h2><button class="btn alt">关闭</button></div><div class="wb-dialog-body"></div>`;d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>{d.remove();document.dispatchEvent(new CustomEvent('workbench:dialog',{detail:{open:!!document.querySelector('.wb-dialog[open]')}}))});document.body.append(d);d.showModal();document.dispatchEvent(new CustomEvent('workbench:dialog',{detail:{open:true}}));return d; }
  function preview(url, type) { if(type==='video')return window.VideoPreview.open(url); const d=dialog(type==='image'?'图片预览':'视频预览');d.querySelector('.wb-dialog-body').classList.add('wb-media-view');if(type==='image'){const img=new Image();img.src=url;img.alt='图片放大预览';d.querySelector('.wb-dialog-body').append(img)}else{const video=document.createElement('video');video.controls=true;video.preload='none';video.src=url;d.querySelector('.wb-dialog-body').append(video);d.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load()})} }
  async function savePreset() {
    const name=prompt('为这套设置起个名字，例如“30秒门店推广”');if(!name?.trim())return;
    const fields={};document.querySelectorAll('input[id],textarea[id],select[id]').forEach(el=>{if(['file','password'].includes(el.type)||/activeLimit|dailyQuota|subjectMaterials|subjectName/.test(el.id))return;fields[el.id]=el.type==='checkbox'?el.checked:el.value});
    const preset={name:name.trim(),page:location.pathname+location.search,fields,templateIds:[...document.querySelectorAll('[data-template]:checked')].map(el=>el.dataset.template)};document.dispatchEvent(new CustomEvent('workbench:collect-preset',{detail:preset}));
    try{await request('/workspace-presets',{method:'POST',body:JSON.stringify(preset)});toast('预设已保存，可在“我的预设”中反复使用。')}catch(e){toast(e.message)}
  }
  async function mark(key, property) { const list=new Set(libraryState[property]||[]);list.has(key)?list.delete(key):list.add(key);libraryState=await request('/workspace-state',{method:'PUT',body:JSON.stringify({[property]:[...list]})}); }
  async function openLibrary(initial='all') {
    const d=dialog('素材与历史'),body=d.querySelector('.wb-dialog-body');body.innerHTML='<div class="wb-empty">正在读取本机记录…</div>';
    try {
      const [records,state]=await Promise.all([request('/workspace-records'),request('/workspace-state')]);libraryState=state;
      body.innerHTML='<div class="wb-library-tools"><input id="wbRecordSearch" placeholder="搜索名称、提示词或状态"><select id="wbRecordType" style="width:130px"><option value="all">全部记录</option><option value="image">图片素材</option><option value="video">视频任务</option><option value="prompt">提示词批次</option><option value="favorite">已收藏</option><option value="hidden">已隐藏</option><option value="preset">设置预设</option></select></div><div class="wb-records"></div>';
      const type=body.querySelector('select'),search=body.querySelector('input'),grid=body.querySelector('.wb-records');type.value=initial;let limit=60;
      const render=()=>{
        const query=search.value.toLowerCase(),all=[...records,...libraryState.presets.map(p=>({...p,key:'preset:'+p.id,type:'preset',title:p.name}))];
        const visible=all.filter(r=>{const hidden=libraryState.hidden.includes(r.key);return (type.value==='hidden'?hidden:!hidden)&&(type.value==='all'||type.value==='hidden'||(type.value==='favorite'?libraryState.favorite.includes(r.key):type.value===r.type))&&(`${r.title} ${r.prompt||''} ${r.status||''}`).toLowerCase().includes(query)});
        grid.innerHTML=visible.length?visible.slice(0,limit).map(r=>`<article class="wb-record" data-key="${esc(r.key)}"><div class="wb-record-media">${r.type==='image'?`<img loading="lazy" src="${esc(r.previewUrl)}" alt="${esc(r.title)}">`:icon(r.type==='video'?'film':r.type==='preset'?'clock':'pen')}</div><div class="wb-record-body"><h3>${esc(r.title)}</h3><p>${esc(r.statusLabel||({review_pending:'等待试片确认',queued:'等待提交',draft_pending:'等待提示词',drafting:'生成提示词中',submitting:'提交中',waiting:'等待生成',running:'生成中',complete_pending_download:'等待保存',complete:'已完成',error:'失败',cancelled:'已取消'})[r.status]||r.status||'已保存')} · ${new Date(r.createdAt).toLocaleString('zh-CN')}</p><div class="wb-toolbar">${r.type==='image'||r.type==='video'&&r.status==='complete'?'<button data-op="preview">预览</button>':''}<button data-op="details">详情</button>${r.prompt?'<button data-op="copy">复制提示词</button>':''}${r.type==='preset'?'<button data-op="use">应用预设</button><button data-op="delete-preset">删除</button>':''}${r.type==='prompt'?'<button data-op="reuse">继续使用</button>':''}<button data-op="favorite">${libraryState.favorite.includes(r.key)?'★ 已收藏':'☆ 收藏'}</button><button data-op="hidden">${libraryState.hidden.includes(r.key)?'恢复显示':'隐藏'}</button></div></div></article>`).join(''):'<div class="wb-empty">没有匹配记录。上传的图片和生成任务会自动归档到这里。</div>';
        grid.querySelectorAll('[data-op]').forEach(button=>button.onclick=async()=>{const r=all.find(r=>r.key===button.closest('[data-key]').dataset.key);try{
          if(['details','copy','reuse'].includes(button.dataset.op))await hydrate(r);
          switch(button.dataset.op){
            case 'preview':preview(r.type==='image'?r.previewUrl:'/api/video/'+r.id,r.type);break;
            case 'copy':await navigator.clipboard.writeText(r.prompt);toast('提示词已复制');break;
            case 'details':{const detail=dialog(r.title),box=detail.querySelector('.wb-dialog-body');box.innerHTML=`<p>${esc(r.model||'')} ${esc(r.duration?`${r.duration} 秒`:'')} ${esc(r.error||'')}</p><pre style="white-space:pre-wrap;font-size:12px">${esc(r.prompt||'没有提示词；此记录包含素材或已保存设置。')}</pre>${r.type==='video'&&r.status==='complete'?`<a class="btn" href="/api/video/${r.id}?download=1" download>下载成片</a>`:''}`;break}
            case 'favorite':case 'hidden':await mark(r.key,button.dataset.op);render();break;
            case 'use':{if(r.kind==='replica'){location.href='/clone?preset='+r.id;return}if(r.page!==location.pathname+location.search){sessionStorage.setItem('workbench:pending-preset',JSON.stringify(r));location.href=r.page;return}applyPreset(r);d.close();break}
            case 'reuse':if(r.kind==='store'&&(!byId('studioPage')||(new URLSearchParams(location.search).get('pack')||'foot-spa-store')!==r.packId)){sessionStorage.setItem('workbench:pending-record',JSON.stringify(r));location.href='/?mode=store&pack='+r.packId;return}if((r.kind==='story'&&location.pathname!=='/story')||(r.kind==='paired'&&byId('pairPreview')===null)){sessionStorage.setItem('workbench:pending-record',JSON.stringify(r));location.href=r.kind==='story'?'/story':'/?mode=paired';return}document.dispatchEvent(new CustomEvent('workbench:reuse',{detail:r}));d.close();break;
            case 'delete-preset':if(confirm('删除这套预设？已经生成的素材不会删除。')){libraryState=await request('/workspace-presets/'+r.id,{method:'DELETE'});render()}break;
          }
        }catch(e){toast(e.message)}});
        const batchGroups=new Map();for(const card of [...grid.querySelectorAll('.wb-record')]){const record=all.find(r=>r.key===card.dataset.key);if(record?.type!=='video'||!record.batchId)continue;let group=batchGroups.get(record.batchId);if(!group){group=document.createElement('details');group.className='wb-batch-record';group.innerHTML=`<summary>视频批次 · ${new Date(record.createdAt).toLocaleString('zh-CN')} · ${all.filter(r=>r.type==='video'&&r.batchId===record.batchId).length} 条</summary><div data-review-anchor></div>`;grid.insertBefore(group,card);batchGroups.set(record.batchId,group);window.VideoPreview?.reviewBatch(record.batchId,group.querySelector('[data-review-anchor]'))}group.append(card)}
        if(visible.length>limit){const more=document.createElement('button');more.className='btn alt';more.textContent=`继续显示（已展示 ${limit} / ${visible.length}）`;more.onclick=()=>{limit+=60;render()};grid.append(more)}
      };type.onchange=search.oninput=()=>{limit=60;render()};render();
    }catch(e){body.textContent='无法读取记录：'+e.message}
  }
  async function hydrate(record) {
    if(record.loaded||!['prompt','video'].includes(record.type))return;
    if(record.type==='video'){const job=await request('/jobs/'+record.id);record.prompt=job.prompt||'';}
    else{const task=await request((record.kind==='store'?'/action-prompt-tasks/':record.kind==='story'?'/story-tasks/':'/keyframe-prompt-tasks/')+record.id);record.result=task.result;record.prompt=(task.result?.items||[]).map((item,index)=>`${index+1}. ${item.prompt||item.imagePrompt||''}`).join('\n\n');}
    record.loaded=true;
  }
  function applyPreset(preset) { for(const [id,value] of Object.entries(preset.fields||{})){const el=byId(id);if(!el||['password','file'].includes(el.type))continue;if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===String(value)))continue;if(el.type==='checkbox')el.checked=!!value;else el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))}document.dispatchEvent(new CustomEvent('workbench:preset',{detail:preset}));window.WorkbenchCache?.save();toast('预设已应用，尚未提交任何生成任务。') }
  function updateStatus() {
    const ids=['draftMessage','promptMessage','pairMessage','imageProgress','videoProgress','progress','trialMeta','message','transformStatus'];const text=ids.map(id=>byId(id)?.textContent?.trim()||'').filter(Boolean);
    const busy=text.find(t=>/正在|生成中|提交中|等待生成|等待提示词|处理中/.test(t)),failure=text.find(t=>/失败|无法|错误/.test(t));
    const label=busy||failure||text.find(t=>/完成|已生成|进入/.test(t))||'草稿自动保存在本机 · 素材与任务会留档';const target=statusline.querySelector('span');if(target.textContent!==label.slice(0,160))target.textContent=label.slice(0,160);statusline.dataset.busy=String(!!busy);
    const count=text.join(' ').match(/(\d+)\/(\d+)\s*完成/),progress=statusline.querySelector('progress');progress.hidden=!count||!Number(count[2]);if(count){progress.max=Number(count[2])||1;progress.value=Number(count[1])}
    const footer=document.querySelector('[data-needs-images]');if(footer)footer.hidden=byId('imageReviewCard').classList.contains('hidden');
  }
  function enhancePrompts() {
    for(const area of document.querySelectorAll('[data-prompt]')){
      if(area.nextElementSibling?.classList.contains('wb-prompt-tools'))continue;
      const tools=document.createElement('div');tools.className='wb-prompt-tools';tools.innerHTML='<button>复制</button><button>删除草稿</button>';
      tools.children[0].onclick=async()=>{try{await navigator.clipboard.writeText(area.value);toast('提示词已复制')}catch{toast('复制失败，请手动选择文字复制')}};
      tools.children[1].onclick=()=>{if(confirm('删除这条提示词草稿？已有图片和视频记录会保留。'))document.dispatchEvent(new CustomEvent('workbench:remove-prompt',{detail:{id:area.dataset.prompt}}))};area.after(tools);
    }
  }
  function ready() {
    document.body.classList.add('wb');if(document.body.dataset.workspace==='replica'){nav(location.pathname==='/presets'?'presets':'clone');return}const mode=byId('subjectId')?'story':byId('studioPage')?'store':'paired';document.body.classList.add('wb-'+mode);nav(mode);
    const defaultView=mode==='story'?setupStory():mode==='store'?setupStore():setupPaired();
    const toggle=document.createElement('button');toggle.className='wb-toggle-context';toggle.textContent='收起资料';toggle.onclick=()=>{if(innerWidth<=820)frame.classList.toggle('wb-context-mobile');else frame.classList.toggle('wb-context-hidden');toggle.textContent=frame.classList.contains('wb-context-hidden')?'展开资料':'收起资料';remember({contextHidden:frame.classList.contains('wb-context-hidden')})};tabs.append(toggle);
    frame.classList.toggle('wb-context-hidden',!!localRead().contextHidden);show(localRead().view||defaultView);
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href^="/api/video/"]');if(link&&!link.hasAttribute('download')&&!link.href.includes('download=1')){event.preventDefault();preview(link.getAttribute('href'),'video')}
      const image=event.target.closest('#imageGallery img');if(image)preview(image.src,'image');
      const id=event.target.closest('button')?.id;const target=({previewTuning:'prompts',draft:'prompts',direct:'videos',run:'videos',startImages:'images',confirmImages:'videos',createTrial:'videos',approve:'videos',confirmTuning:'prompts'})[id];if(target&&!event.target.closest('button').disabled)show(target);
      if(event.target.closest('[data-trial],[data-job]'))show('videos');
    },true);
    document.addEventListener('dblclick',event=>{const image=event.target.closest('#refs img');if(image)preview(image.src,'image')});
    let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;enhancePrompts();updateStatus()},150)}).observe(frame,{subtree:true,childList:true,characterData:true});enhancePrompts();updateStatus();
    setInterval(updateStatus,2000);
    const applyPending=()=>{for(const [key,eventName] of [['workbench:pending-record','workbench:reuse'],['workbench:pending-preset','workbench:preset']]){const value=sessionStorage.getItem(key);if(!value)continue;try{const detail=JSON.parse(value);if(eventName==='workbench:preset')applyPreset(detail);else document.dispatchEvent(new CustomEvent(eventName,{detail}));sessionStorage.removeItem(key)}catch(e){toast('恢复失败：'+e.message)}}};
    if(window.WorkbenchDataReady)applyPending();else document.addEventListener('workbench:ready',applyPending,{once:true});
  }
  window.WorkbenchUI={show,toast,preview,openLibrary,dialog};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
