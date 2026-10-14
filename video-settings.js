export const serviceFamily=id=>String(id||'').includes('tokendance')?'tokendance':id;
export function publicModelName(r){return r.id==='doubao'?'豆包':String(r.model||r.name).replace(/TokenDance|ByteDance|APIMart/gi,'').replace(/^[ ·]+/,'');}
export function modelRoutes(routes,id){return routes.filter(r=>r.id==='doubao'||r.audioDriven||String(r.id).includes('tokendance')).map(r=>({...r,name:publicModelName(r)}));}
export function serviceRoutes(routes){
  const result=[];
  for(const r of routes){if(result.some(v=>serviceFamily(v.id)===serviceFamily(r.id)))continue;result.push(serviceFamily(r.id)==='tokendance'?(routes.find(v=>v.id==='wan-tokendance')||r):r);}
  return result;
}
export function serviceId(routes,id){return serviceRoutes(routes).find(r=>serviceFamily(r.id)===serviceFamily(id))?.id||id;}
export function generationSettingsMarkup(routes,choice,esc){
  const option=(items,value)=>items.map(r=>`<option value="${esc(r.id??r)}" ${(r.id??r)===value?'selected':''}>${esc(r.name??r)}</option>`).join('');
  const route=routes.find(r=>r.id===choice.videoRoute),models=modelRoutes(routes,choice.videoRoute);
  return `<h2>视频生成设置</h2><p>选择视频模型，设置将用于本次视频。</p><div class="required-generation-grid"><select id="projectVideoRoute" hidden aria-hidden="true">${option(routes,choice.videoRoute)}</select><label>模型<select id="projectVideoModel">${option(models.map(r=>({id:r.id,name:publicModelName(r)})),choice.videoRoute)}</select></label><label>画面比例<select id="projectRatio">${option([{id:'auto',name:'跟随底图比例'},{id:'9:16',name:'竖屏9:16'},{id:'16:9',name:'横屏16:9'},{id:'1:1',name:'方形1:1'}],choice.ratio)}</select></label><label>画质<select id="projectResolution">${option(route?.resolutions||[],choice.resolution)}</select></label><label>图片用途<select id="projectReferenceMode">${option([{id:'first-frame',name:'作为视频首帧'},{id:'reference-image',name:'人物与场景参考'}],choice.referenceMode)}</select></label></div><p id="modelDurationHint" class="muted"></p>`;
}
