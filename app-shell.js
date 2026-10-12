(() => {
  const paths={home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',batch:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="m3 6 18-3M8 11l7 4-7 4z"/>',replicate:'<path d="M12 3c4 5 1 7 3 9l3-4c5 7 2 13-6 13-8 0-11-7-6-13l2 4c0-4 4-5 4-9z"/>',templates:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',works:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 7 8 5-8 5z"/>',assets:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-7 4 4 4-5 4 6"/>',accounts:'<circle cx="12" cy="6" r="3"/><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="m8 10-2 3m10-3 2 3"/>',settings:'<circle cx="12" cy="12" r="4"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>'};
  const items=[['home','首页','/studio'],['batch','批量制作','/studio?new=1'],['replicate','爆款复刻','/replicate'],['templates','模板中心','/templates'],['works','我的作品','/works'],['assets','我的素材','/assets'],['accounts','豆包账号池','/accounts']];
  const icon=id=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]}</svg>`;
  function mount(){
    document.body.classList.add('app-shell');
    let sidebar=document.querySelector('.sidebar,.wb-nav');if(!sidebar){sidebar=document.createElement('aside');document.body.prepend(sidebar);}
    sidebar.className='sidebar app-sidebar';
    const params=new URLSearchParams(location.search),page=location.pathname;
    const active=page==='/studio'?(params.has('new')||params.has('type')||params.has('project')||params.has('scene')||params.has('template')?'batch':'home'):page==='/replicate'||page==='/clone'?'replicate':page.slice(1);
    sidebar.innerHTML='<a class="brand" href="/studio">帧间</a><nav aria-label="主导航">'+items.map(([id,label,url])=>`<a href="${url}" data-app-nav="${id}" aria-label="${label}" class="${active===id?'active':''}" ${active===id?'aria-current="page"':''}>${icon(id)}<span>${label}</span></a>`).join('')+`</nav><a class="settings-link ${active==='settings'?'active':''}" href="/settings" aria-label="设置">${icon('settings')}<span>设置</span></a>`;
  }
  window.StudioShell={mount};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
