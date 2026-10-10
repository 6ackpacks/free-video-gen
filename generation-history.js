(() => {
  let state=null,limit=18,signature='',data=[];
  const expanded=new Set();
  async function render(trials){
    data=trials;const root=document.getElementById('history');if(!root)return;
    if(!state){state=await api('/workspace-state');if(!document.getElementById('historySearch')){
      const bar=document.createElement('div');bar.className='wb-history-tools';bar.innerHTML='<input id="historySearch" placeholder="搜索模板或日期"><select id="historyStatus"><option value="all">全部状态</option><option value="complete">有可播放视频</option><option value="running">生成中</option><option value="error">有失败任务</option></select><select id="historyArchive"><option value="all">全部记录</option><option value="active">当前记录</option><option value="archived">已收纳</option></select><button class="secondary" id="historyEverything">全部内容历史</button>';root.before(bar);root.classList.remove('historyrows');
      for(const id of ['historySearch','historyStatus','historyArchive'])document.getElementById(id).addEventListener(id==='historySearch'?'input':'change',()=>{limit=18;signature='';render(data);});document.getElementById('historyEverything').onclick=()=>window.WorkbenchUI.openLibrary();
    }}
    const query=document.getElementById('historySearch').value.toLowerCase(),status=document.getElementById('historyStatus').value,archive=document.getElementById('historyArchive').value;
    const rows=trials.filter(t=>{const archived=state.hidden.includes('trial:'+t.id),complete=t.complete??t.jobs?.filter(j=>j.status==='complete').length??0;return (archive==='all'||(archive==='archived'?archived:!archived))&&(status==='all'||status==='complete'&&complete>0||status==='error'&&t.errors>0||status==='running'&&t.generated>complete+(t.errors||0))&&`${t.actionName||t.skillName} ${new Date(t.createdAt).toLocaleString('zh-CN')}`.toLowerCase().includes(query);});
    const next=JSON.stringify(rows.slice(0,limit).map(t=>[t.id,t.complete,t.errors,t.latestStatus,t.generated,t.previewJobs]))+query+status+archive+limit;if(next===signature)return;signature=next;
    root.innerHTML=`<p class="history-overview">${rows.length} 个批次 · 点击封面播放，或展开整批查看每条视频</p><div class="history-card-grid">${rows.slice(0,limit).map(t=>{
      const jobs=t.previewJobs||t.jobs?.filter(j=>j.status==='complete'&&j.outputs?.length).slice(0,3)||[],first=jobs[0],complete=t.complete??t.jobs?.filter(j=>j.status==='complete').length??0;
      return `<article class="history-video-card"><button class="video-cover" ${first?`data-history-play="${first.id}"`:'disabled'} aria-label="${first?'播放':'等待生成'} ${esc(t.actionName||t.skillName)}">${first?`<img alt="视频封面" data-video-poster="${first.id}" data-video-src="/api/video/${first.id}?preview=1"><span class="cover-play">▶</span><small>${first.duration||''} 秒 · 点击播放</small>`:`<span class="cover-pending">${esc(statusName[t.latestStatus]||'等待生成')}</span>`}</button><div class="history-card-info"><h3>${esc(t.actionName||t.skillName)}</h3><time>${new Date(t.createdAt).toLocaleString('zh-CN')}</time><p><b>${complete} / ${t.count} 条完成</b>${t.errors?`<span class="history-error"> · ${t.errors} 条失败</span>`:''}</p><div class="wb-toolbar"><button class="secondary" data-history-expand="${t.id}">查看全部 ${t.count} 条</button><button class="secondary" data-history-detail="${t.id}">提示词与任务</button><button class="secondary" data-history-archive="${t.id}">${state.hidden.includes('trial:'+t.id)?'移回当前':'收纳'}</button></div><div class="history-batch-jobs" data-history-jobs="${t.id}" hidden></div></div></article>`;
    }).join('')}</div>${rows.length>limit?`<button class="secondary" id="historyMore">显示更多（${limit} / ${rows.length}）</button>`:''}`;
    root.querySelectorAll('[data-history-play]').forEach(b=>b.onclick=()=>window.WorkbenchUI.preview('/api/video/'+b.dataset.historyPlay,'video'));
    root.querySelectorAll('[data-history-expand]').forEach(b=>b.onclick=()=>expand(b.dataset.historyExpand));
    root.querySelectorAll('[data-history-detail]').forEach(b=>b.onclick=async()=>{try{const t=await api('/trials/'+b.dataset.historyDetail);currentTrial=t.id;selectedJob='';const i=data.findIndex(x=>x.id===t.id);data[i]={...data[i],...t};renderTrial();window.WorkbenchUI.show('videos');}catch(e){notify(e.message);}});
    root.querySelectorAll('[data-history-archive]').forEach(b=>b.onclick=async()=>{try{const latest=await api('/workspace-state'),hidden=new Set(latest.hidden),key='trial:'+b.dataset.historyArchive;hidden.has(key)?hidden.delete(key):hidden.add(key);state=await api('/workspace-state',{method:'PUT',body:JSON.stringify({hidden:[...hidden]})});signature='';render(data);}catch(e){notify(e.message);}});
    document.getElementById('historyMore')?.addEventListener('click',()=>{limit+=18;signature='';render(data);});
    for(const id of expanded)if(root.querySelector(`[data-history-jobs="${id}"]`))expand(id,true);window.VideoCards.observe(root);
  }
  async function expand(id,restore=false){
    const area=document.querySelector(`[data-history-jobs="${id}"]`);if(!area)return;
    if(!restore&&!area.hidden){area.hidden=true;expanded.delete(id);return;}area.hidden=false;expanded.add(id);area.textContent='正在读取整批视频…';
    try{const t=await api('/trials/'+id);if(!area.isConnected)return;area.innerHTML=t.jobs.map(j=>`<div class="history-job-row"><strong>画面 ${j.index} · ${esc(j.actionName||j.actionId)} · ${j.duration||t.duration} 秒</strong><span>${esc(statusName[j.status]||j.status)}${j.error?' · '+esc(j.error):''}</span>${j.status==='complete'&&j.outputs?.length?`<div class="wb-toolbar"><button class="secondary" data-row-preview="${j.id}">播放预览</button><a class="secondary" href="/api/video/${j.id}?download=1" download>下载</a></div>`:''}</div>`).join('')||'此批次没有视频任务';area.querySelectorAll('[data-row-preview]').forEach(b=>b.onclick=()=>window.WorkbenchUI.preview('/api/video/'+b.dataset.rowPreview,'video'));}catch(e){area.textContent=e.message;}
  }
  window.GenerationHistory={render};
})();
