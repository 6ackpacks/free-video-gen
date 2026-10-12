const ids=value=>{if(value===undefined)return [];if(!Array.isArray(value)||value.length>12||value.some(v=>typeof v!=='string'||!v||v.length>100))throw Error('素材编号无效，每类最多12张');return [...new Set(value)];};
const text=(value,max=2000)=>String(value||'').trim().slice(0,max);
export function creativeInputs(input,previous={}){
 const m=input.materials??previous.materials??{},b=input.productBrief??previous.productBrief??{},s=input.massageSpec??previous.massageSpec??{};
 const videoDirection=input.videoDirection??previous.videoDirection??'';
 if(!['','product-commercial','unboxing-review','continuous-commercial'].includes(videoDirection))throw Error('视频方向无效');
 const avatarMode=input.avatarMode??previous.avatarMode??'native';if(!['native','audio-driven'].includes(avatarMode))throw Error('口播生成方式无效');
 const audioUrl=text(input.audioUrl??previous.audioUrl,2000);
 if(audioUrl){const url=new URL(audioUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('配音地址须为不含账号密码的HTTPS链接');}
 return {videoDirection,avatarMode,audioUrl,materials:{productImageIds:ids(m.productImageIds),personImageIds:ids(m.personImageIds),sceneImageIds:ids(m.sceneImageIds)},productBrief:{name:text(b.name,100),sellingPoints:text(b.sellingPoints),script:text(b.script,4000),voice:text(b.voice,200),music:text(b.music,200)},massageSpec:{bodyArea:text(s.bodyArea,80),position:text(s.position,200),contact:text(s.contact,300)}};
}
export function creativePrompt(p){
 const {productBrief:b={},materials:m={},massageSpec:s={}}=p,lines=[];
 if(b.name||b.sellingPoints)lines.push(`真实商品：${b.name||'按产品图'}。已确认卖点：${b.sellingPoints||'只展示可见外观，不编造功效'}。`);
 if(m.productImageIds?.length)lines.push('产品参考图锁定包装、形状、颜色、标签及材质，不改变商品身份。');
 if(m.personImageIds?.length)lines.push('人物参考图锁定成年人物面容与穿搭。');
 if(m.sceneImageIds?.length)lines.push('场景参考图锁定真实背景与空间布局。');
 if(p.templateTypeId?.endsWith(':avatar-talk'))lines.push(`固定场景、构图与机位，中近景，脸部和产品清晰可见。人物自然面对镜头说话并持有商品。准确口播台词：${b.script||''}。声音：${b.voice||'自然清晰的中文口语'}。不切换机位、不增加未提供的卖点。`);
 if(p.videoDirection==='product-commercial')lines.push('给定单条视频时长内，按商品亮相、已确认卖点展示、收尾规划相对节奏；时长不足时精简镜头。');
 if(p.videoDirection==='unboxing-review')lines.push('按开箱20%、体验60%、总结20%的相对节奏规划，手持实拍感和自然口语；不编造实测结果、价格或对比结论。');
 if(p.videoDirection==='continuous-commercial')lines.push('单条视频采用连续镜头，动作自然承接、不切镜、不瞬移。当前输出一个完整短镜头，不伪称已完成跨任务首尾帧承接。');
 if(s.bodyArea||s.position||s.contact)lines.push(`按摩部位：${s.bodyArea||'按动作模板'}；起始姿态：${s.position||'按已确认人物底图'}；接触要求：${s.contact||'双手自然接触正确护理部位'}。成年人、正确接触和站位，不虚构医疗效果。`);
 if(b.script&&!p.templateTypeId?.endsWith(':avatar-talk'))lines.push(`口语旁白：${b.script}。`);
 if(b.music)lines.push(`背景音乐：${b.music}。`);
 return lines.join('\n');
}
export function creativeErrors(p,references,routes=[]){
 const errors=[],avatar=p.templateTypeId?.endsWith(':avatar-talk'),b=p.productBrief||{},m=p.materials||{};
 for(const list of Object.values(m))for(const id of list){try{references.get(id);}catch{errors.push('所选素材不存在，请重新选择');}}
 if(avatar||p.videoDirection){if(!m.productImageIds?.length)errors.push('请添加真实产品图');if(!b.name)errors.push('请填写产品名称');if(!b.sellingPoints)errors.push('请填写并确认产品卖点');}
 if(avatar){if(!b.script)errors.push('请填写口播文案');
  if(p.avatarMode==='audio-driven'){if(!p.audioUrl)errors.push('请提供配音音频的HTTPS地址');if(p.plans.some(v=>!routes.find(r=>r.id===v.videoRoute)?.audioDriven))errors.push('音频对口型请选择支持配音驱动的服务');}
  else if(p.plans.some(v=>!routes.find(r=>r.id===v.videoRoute)?.nativeAudio))errors.push('模型口播请选择支持原生声音的服务');
 }
 return [...new Set(errors)];
}
