(() => {
  const pending=[],known=new Map();let running=0;
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);load(entry.target);}},{rootMargin:'100px'});
  function observe(root=document){root.querySelectorAll('img[data-video-poster]:not([data-observed])').forEach(img=>{img.dataset.observed='1';observer.observe(img);});}
  async function load(img){
    const id=img.dataset.videoPoster;
    if(!known.has(id))known.set(id,new Promise(resolve=>{pending.push({id,src:img.dataset.videoSrc,resolve});pump();}));
    const src=await known.get(id);if(src&&img.isConnected){img.src=src;img.closest('.video-cover')?.classList.add('has-poster');}
  }
  function pump(){while(running<2&&pending.length){const task=pending.shift();running++;create(task).then(task.resolve).catch(()=>task.resolve('')).finally(()=>{running--;pump();});}}
  async function create({id,src}){
    const url='/api/video-posters/'+id;
    if((await fetch(url)).ok)return url;
    return new Promise(resolve=>{
      const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
      let done=false;const timer=setTimeout(()=>finish(''),15000);
      function finish(value){if(done)return;done=true;clearTimeout(timer);video.pause();video.removeAttribute('src');video.load();resolve(value);}
      video.onerror=()=>finish('');
      video.onloadeddata=async()=>{
        if(done||!video.videoWidth)return;
        try{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.round(320*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const dataUrl=canvas.toDataURL('image/jpeg',.7);finish(dataUrl);await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});}catch{finish('');}
      };
      video.src=src;
    });
  }
  window.VideoCards={observe};
})();
