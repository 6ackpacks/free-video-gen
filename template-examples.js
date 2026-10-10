(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function open(example,title){
    if(example.jobId)return window.WorkbenchUI.preview('/api/video/'+example.jobId,'video');
    const dialog=window.WorkbenchUI.dialog(title+' · 示例视频'),video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.style.cssText='width:100%;max-height:65vh;background:#111';video.src=example.videoUrl;dialog.querySelector('.wb-dialog-body').append(video);dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();});
  }
  function enhance(){
    const root=document.getElementById('templates');if(!root)return;
    for(const button of [...root.querySelectorAll('[data-action]')]){
      const t=templates.find(t=>t.id===button.dataset.action);if(!t||button.parentElement.classList.contains('template-with-example'))continue;
      const card=document.createElement('article');card.className='template-with-example';button.before(card);card.append(button);
      const example=t.example,preview=document.createElement('div');preview.className='template-example';
      preview.innerHTML=example?`<button class="video-cover" data-example-preview aria-label="预览 ${esc(t.name)} 示例"><img alt="${esc(t.name)} 示例封面" data-video-poster="${example.posterId}" data-video-src="${esc(example.videoUrl)}"><span class="cover-play">▶</span><small>示例视频${example.duration?' · '+example.duration+' 秒':''}</small></button>`:'<div class="example-empty">暂无示例视频</div>';
      const manage=document.createElement('button');manage.className='secondary';manage.textContent=example?'更换示例':'添加示例';manage.onclick=()=>choose(t);preview.append(manage);card.append(preview);
      preview.querySelector('[data-example-preview]')?.addEventListener('click',()=>open(example,t.name));
    }
    window.VideoCards.observe(root);
  }
  async function choose(t){
    const dialog=window.WorkbenchUI.dialog(t.name+' · 设置示例'),body=dialog.querySelector('.wb-dialog-body');
    body.innerHTML='<p class="hint">选用该模板的历史成片，或上传能展示该动作的本地 MP4（最多 50 MB）。</p><label class="upload">上传本地示例<input type="file" accept="video/mp4,.mp4"></label><p data-example-status role="status"></p><div class="example-choices">正在读取历史成片…</div>';
    const status=body.querySelector('[role=status]');
    async function save(payload){status.textContent='正在保存示例…';try{const result=await api(`/template-examples/${selectedPack}/${t.id}`,{method:'POST',body:JSON.stringify(payload)});t.example=result;dialog.close();renderTemplates();}catch(e){status.textContent=e.message;}}
    body.querySelector('input').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>50*1024*1024){status.textContent='文件最多 50 MB';return;}const reader=new FileReader();reader.onload=()=>save({name:file.name,dataUrl:reader.result});reader.onerror=()=>status.textContent='读取文件失败';reader.readAsDataURL(file);};
    try{
      const jobs=(await api('/jobs')).filter(j=>j.status==='complete'&&j.outputs?.length&&j.actionId===t.id&&(j.packId||'foot-spa-store')===selectedPack);
      body.querySelector('.example-choices').innerHTML=jobs.length?jobs.map(j=>`<article><button class="video-cover" data-preview-job="${j.id}" aria-label="预览历史示例"><img alt="历史视频封面" data-video-poster="${j.id}" data-video-src="/api/video/${j.id}?preview=1"><span class="cover-play">▶</span></button><p>${esc(new Date(j.createdAt).toLocaleString('zh-CN'))} · ${j.duration} 秒</p><button class="secondary" data-use-example="${j.id}">用作模板示例</button></article>`).join(''):'<p class="hint">该模板还没有已完成的视频，可上传本地示例。</p>';
      body.querySelectorAll('[data-preview-job]').forEach(b=>b.onclick=()=>window.WorkbenchUI.preview('/api/video/'+b.dataset.previewJob,'video'));
      body.querySelectorAll('[data-use-example]').forEach(b=>b.onclick=()=>save({jobId:b.dataset.useExample}));window.VideoCards.observe(body);
    }catch(e){status.textContent=e.message;}
  }
  window.TemplateExamples={enhance};document.addEventListener('workbench:ready',enhance);
})();
