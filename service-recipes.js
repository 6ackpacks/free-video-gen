export const SERVICE_RECIPES=[
 {id:'product-commercial',name:'商品宣传短片',summary:'以产品为主角，展示使用场景与真实卖点。',rule:'复用真实产品图，保持包装、颜色与外观一致；按时长安排吸引注意、产品使用或卖点特写、产品收尾；时长不足时精简信息，不编造功效。'},
 {id:'unboxing-review',name:'开箱测评短片',summary:'开箱、实际体验与简洁总结，自然手持拍摄。',rule:'按可用时长安排开箱20%、体验60%、总结20%；展示真实产品外观与已确认卖点，自然光、生活场景、自然口语，不杜撰测评结论或对比数据。'},
 {id:'continuous-commercial',name:'一镜到底广告',summary:'单个连续镜头展示产品或服务体验。',rule:'全片为一个不中断的连续镜头，主体、光线和空间保持连贯；通过连续动作展示已确认卖点，不切镜头，不跳跃站位。'}
];
export function upgradeServiceRecipes(templates,seeds){for(const seed of seeds.filter(s=>s.serviceRecipeId)){const t=templates.find(v=>v.id===seed.id);if(t?.source==='builtin'&&t.version===1&&['服务介绍','过程展示','亮点展示'].includes(t.name)){for(const key of ['name','description','actions','imageRules','serviceRecipeId'])t[key]=structuredClone(seed[key]);t.version+=1;t.versions.push({...structuredClone(seed),version:t.version,createdAt:new Date().toISOString()});}}}
