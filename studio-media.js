(() => {
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Modern studio shares the video tools without loading the old workbench layout.
  if(!window.WorkbenchUI)window.WorkbenchUI={};
  window.WorkbenchUI.dialog ||= title=>{
    const origin=document.activeElement,dialog=document.createElement('dialog');
    dialog.className='studio-media-dialog';
    dialog.innerHTML=`<header><h2>${escape(title)}</h2><button type="button" aria-label="关闭视频预览">×</button></header><div class="wb-dialog-body"></div>`;
    document.body.append(dialog);dialog.querySelector('header button').onclick=()=>dialog.close();
    dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>{dialog.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});dialog.remove();if(origin?.isConnected)origin.focus();},{once:true});
    dialog.showModal();return dialog;
  };
  window.WorkbenchUI.preview ||= url=>window.VideoPreview?.open(url);
  document.addEventListener('play',event=>{
    if(event.target?.tagName!=='VIDEO')return;
    document.querySelectorAll('video').forEach(video=>{if(video!==event.target&&!video.paused)video.pause();});
  },true);
  const observed=new WeakSet();
  const viewport=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{if(!isIntersecting&&!target.paused)target.pause();}));
  function observe(){
    document.querySelectorAll('#app video[src^="/api/video/"]').forEach(video=>{
      if(observed.has(video))return;observed.add(video);viewport.observe(video);
      const id=/\/api\/video\/([a-f0-9-]+)/.exec(video.getAttribute('src'))?.[1];if(!id)return;
      video.preload='none';video.playsInline=true;
      const controls=document.createElement('div');controls.className='studio-media-controls';
      controls.innerHTML='<button type="button" class="media-open">⛶ 放大预览</button><button type="button" class="media-reload" hidden>重新加载</button><span class="studio-media-status" role="status"></span>';
      video.after(controls);
      controls.querySelector('.media-open').onclick=()=>window.VideoPreview?.open('/api/video/'+id);
      controls.querySelector('.media-reload').onclick=()=>{video.load();controls.querySelector('.media-reload').hidden=true;controls.querySelector('[role=status]').textContent='正在重新读取视频…';};
      video.addEventListener('waiting',()=>controls.querySelector('[role=status]').textContent='正在准备画面，可放大查看进度');
      video.addEventListener('playing',()=>{document.querySelectorAll('video').forEach(v=>{if(v!==video&&!v.paused)v.pause();});controls.querySelector('[role=status]').textContent='';});
      video.addEventListener('error',()=>{controls.querySelector('[role=status]').textContent='视频暂时无法播放，请重新加载或下载查看';controls.querySelector('.media-reload').hidden=false;});
    });
    document.querySelectorAll('#app img[src*="/design-assets/"]').forEach(img=>{img.loading='lazy';img.decoding='async';if(!img.hasAttribute('width'))img.width=640;if(!img.hasAttribute('height'))img.height=360;});
  }
  let frame;const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(observe);});
  document.addEventListener('DOMContentLoaded',()=>{observer.observe(document.getElementById('app'),{childList:true,subtree:true});observe();});
})();
