(() => {
  const api = async (path, options = {}) => {
    const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '无法读取视频');
    return result;
  };
  let currentDialog;
  function open(url) {
    const id = /^\/api\/video\/([a-f0-9-]{36})/i.exec(url)?.[1];
    if (!id) return;
    currentDialog?.close();
    const dialog = window.WorkbenchUI.dialog('视频试览');
    currentDialog = dialog;
    const body = dialog.querySelector('.wb-dialog-body');
    body.classList.add('wb-video-preview');
    body.innerHTML = '<div class="wb-preview-title"></div><video controls playsinline preload="metadata" hidden></video><div class="wb-preview-status" role="status"></div><progress hidden></progress><div class="wb-toolbar"><button data-prev>上一条</button><span data-position></span><button data-next>下一条</button><button data-retry hidden>重新加载</button><button data-cache>保存到本机</button><a class="btn alt" download>下载此条</a></div>';
    const video = body.querySelector('video'), status = body.querySelector('[role=status]'), progress = body.querySelector('progress');
    const previous = body.querySelector('[data-prev]'), next = body.querySelector('[data-next]'), retry = body.querySelector('[data-retry]');
    let jobs = [], index = 0, timer, revision = 0;
    function stop() { clearTimeout(timer); video.pause(); video.removeAttribute('src'); video.load(); }
    dialog.addEventListener('close', () => { revision++; stop(); if (currentDialog === dialog) currentDialog = null; });
    video.addEventListener('waiting', () => status.textContent = '正在缓冲…');
    video.addEventListener('playing', () => {
      status.textContent = video.src.includes('preview=1') ? '正在按需播放；网络不稳定时可保存到本机后查看。' : '从本机缓存播放';
      try { localStorage.setItem('video-preview:seen:' + jobs[index].id, '1'); } catch {}
      document.dispatchEvent(new CustomEvent('workbench:video-previewed', { detail: { id: jobs[index].id } }));
      for(const area of document.querySelectorAll('.wb-review-first')){const data=JSON.parse(area.dataset.signature||'[]');if(data[0])reviewBatch(data[0],area.nextElementSibling);}
    });
    video.addEventListener('error', () => { if (video.getAttribute('src')) { status.textContent = '浏览器无法播放此视频，请下载查看或重新准备。'; retry.hidden = false; } });
    async function select() {
      const token = ++revision;
      stop(); video.hidden = true; retry.hidden = true;
      const job = jobs[index];
      body.querySelector('.wb-preview-title').textContent = job.skillName || job.actionName || `视频 ${job.index || index + 1}`;
      body.querySelector('[data-position]').textContent = `${index + 1} / ${jobs.length}`;
      previous.disabled = index === 0; next.disabled = index >= jobs.length - 1;
      body.querySelector('a').href = `/api/video/${job.id}?download=1`;
      status.textContent = '正在读取视频…'; progress.hidden = true;
      const cacheButton=body.querySelector('[data-cache]');cacheButton.disabled=false;
      cacheButton.onclick=()=>{cacheButton.disabled=true;progress.hidden=false;poll(true);};
      async function poll(first = false) {
        try {
          const state = await api(`/video/${job.id}/cache`, first ? { method: 'POST', body: '{}' } : {});
          if (!dialog.open || token !== revision) return;
          if (state.ready) {
            progress.hidden = true; video.hidden = false;
            if(!video.getAttribute('src'))video.src = `/api/video/${job.id}`;
            cacheButton.textContent='已保存到本机';cacheButton.disabled=true;
            if(video.paused)status.textContent = '已保存到本机，点击播放；可拖动进度查看。';
            return;
          }
          if (state.error) throw Error(state.error);
          if (!state.running) throw Error('准备已中断，请重试。');
          const mb = value => (value / 1024 / 1024).toFixed(1);
          status.textContent = state.totalBytes ? `正在保存到本机 ${mb(state.bytes)} / ${mb(state.totalBytes)} MB，完成后可流畅播放` : `等待下载或正在保存到本机 ${mb(state.bytes)} MB…`;
          if (state.totalBytes) { progress.max = state.totalBytes; progress.value = state.bytes; }
          timer = setTimeout(() => poll(), 1000);
        } catch (error) {
          if (!dialog.open || token !== revision) return;
          progress.hidden = true; status.textContent = '预览准备失败：' + error.message; retry.hidden = false;
        }
      }
      try {
        const state=await api(`/video/${job.id}/cache`);
        if(!dialog.open||token!==revision)return;
        video.hidden=false;video.src=`/api/video/${job.id}${state.ready?'':'?preview=1'}`;
        cacheButton.textContent=state.ready?'已保存到本机':'保存到本机';cacheButton.disabled=state.ready;
        status.textContent=state.ready?'本机视频已就绪，点击播放。':'点击播放即可按需加载，无需等整条下载。';
        if(state.running){cacheButton.disabled=true;progress.hidden=false;poll();}
      }catch(error){status.textContent=error.message;retry.hidden=false;}
    }
    previous.onclick = () => { index--; select(); };
    next.onclick = () => { index++; select(); };
    retry.onclick = select;
    (async () => {
      try {
        const job = await api('/jobs/' + id);
        const batch = job.batchId ? await api('/jobs?batch=' + encodeURIComponent(job.batchId)) : [job];
        if (!dialog.open) return;
        jobs = batch.filter(item => item.status === 'complete' && item.outputs?.length);
        index = jobs.findIndex(item => item.id === id);
        if (index < 0) throw Error('此视频尚未生成完成');
        select();
      } catch (error) { status.textContent = error.message; previous.disabled = next.disabled = true; }
    })();
    return dialog;
  }
  const reviewRequests = new Set();
  async function reviewBatch(batchId, container) {
    if (!container || reviewRequests.has(batchId)) return;
    reviewRequests.add(batchId);
    try {
      const state = await api(`/batches/${batchId}/review`);
      let area = container.previousElementSibling?.classList.contains('wb-review-first') ? container.previousElementSibling : null;
      if (!state.required || state.approved) { area?.remove(); return; }
      if (!area) { area = document.createElement('div'); area.className = 'wb-review-first'; container.before(area); }
      const seen = localStorage.getItem('video-preview:seen:' + state.trialJobId) === '1';
      const signature = JSON.stringify([batchId, state.ready, state.remaining, seen]);
      if (area.dataset.signature === signature) return;
      area.dataset.signature = signature;
      area.innerHTML = `<strong>先试览，再继续批量生成</strong><p>${state.ready ? '试片已完成，请打开试览确认画面与动作。' : '正在生成第 1 条试片，剩余视频保留在本批等待确认。'}</p><div class="wb-toolbar"><button data-trial ${state.ready ? '' : 'disabled'}>打开试片</button><button data-approve ${state.ready && seen ? '' : 'disabled'}>满意，生成剩余 ${state.remaining} 条</button></div><small>${seen ? '已打开并播放试片，可以继续。' : '播放试片后可确认继续。'}</small>`;
      area.querySelector('[data-trial]').onclick = () => open('/api/video/' + state.trialJobId);
      area.querySelector('[data-approve]').onclick = async event => {
        event.target.disabled = true;
        try { await api(`/batches/${batchId}/review`, { method: 'POST', body: '{}' }); area.remove(); window.WorkbenchUI.toast('剩余视频已进入生成队列。'); }
        catch (error) { window.WorkbenchUI.toast(error.message); event.target.disabled = false; }
      };
    } catch (error) { window.WorkbenchUI?.toast(error.message); }
    finally { reviewRequests.delete(batchId); }
  }
  window.VideoPreview = { open, reviewBatch };
})();
