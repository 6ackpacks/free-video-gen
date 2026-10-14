export const serviceFamily=id=>String(id||'').includes('tokendance')?'tokendance':id;
export function modelRoutes(routes,id){return routes.filter(r=>serviceFamily(r.id)===serviceFamily(id));}
export function serviceRoutes(routes){
  const result=[];
  for(const r of routes){if(result.some(v=>serviceFamily(v.id)===serviceFamily(r.id)))continue;result.push(serviceFamily(r.id)==='tokendance'?(routes.find(v=>v.id==='wan-tokendance')||r):r);}
  return result;
}
export function serviceId(routes,id){return serviceRoutes(routes).find(r=>serviceFamily(r.id)===serviceFamily(id))?.id||id;}
export function generationSettingsMarkup(routes,choice,esc){
  const option=(items,value)=>items.map(r=>`<option value="${esc(r.id??r)}" ${(r.id??r)===value?'selected':''}>${esc(r.name??r)}</option>`).join('');
  const route=routes.find(r=>r.id===choice.videoRoute),models=modelRoutes(routes,choice.videoRoute);
  return `<h2>视频生成设置</h2><p>选择本次使用的服务与模型，设置将用于样片和后续视频。</p><div class="required-generation-grid"><label>生成服务<select id="projectVideoRoute">${option(serviceRoutes(routes),serviceId(routes,choice.videoRoute))}</select></label><label>模型<select id="projectVideoModel">${option(models.map(r=>({id:r.id,name:r.model||r.name})),choice.videoRoute)}</select></label><label>画面比例<select id="projectRatio">${option([{id:'auto',name:'跟随底图比例'},{id:'9:16',name:'竖屏9:16'},{id:'16:9',name:'横屏16:9'},{id:'1:1',name:'方形1:1'}],choice.ratio)}</select></label><label>画质<select id="projectResolution">${option(route?.resolutions||[],choice.resolution)}</select></label><label>图片用途<select id="projectReferenceMode">${option([{id:'first-frame',name:'作为视频首帧'},{id:'reference-image',name:'人物与场景参考'}],choice.referenceMode)}</select></label></div><p id="modelDurationHint" class="muted"></p>`;
}
