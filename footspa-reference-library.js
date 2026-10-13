import fs from 'node:fs';
import path from 'node:path';
import {makeCharacters} from './prompt-compiler.js';
import {loadActionTemplates} from './action-templates.js';

export const FOOTSPA_REFERENCE_CATALOG = JSON.parse(fs.readFileSync(new URL('./content-packs/foot-spa-store/references.json',import.meta.url),'utf8'));
export function footspaReferences(root,actionId){
  const clips=FOOTSPA_REFERENCE_CATALOG.clips.filter(c=>!actionId||c.actionIds.includes(actionId)).map(c=>{
    const available=fs.existsSync(path.join(root,'data','footspa-references',c.id+'.mp4'));
    const source=FOOTSPA_REFERENCE_CATALOG.sources.find(s=>s.id===c.sourceId);
    return {...c,source:source||null,videoUrl:available?`/api/footspa-references/${c.id}/video`:'',posterUrl:available?`/api/footspa-references/${c.id}/poster`:'',status:available?'local':source?'external':'unlinked'};
  });
  if(!actionId)for(const source of FOOTSPA_REFERENCE_CATALOG.sources.filter(s=>!FOOTSPA_REFERENCE_CATALOG.clips.some(c=>c.sourceId===s.id))){
    clips.push({id:source.id,title:source.title,actionIds:[],source,sourceMatch:'external-only',group:'原作参考',duration:null,videoUrl:'',posterUrl:'',status:'external',observation:'来源清单中有此原作，当前文件列表没有对应的独立视频；可直接访问抖音。'});
  }
  return clips;
}
export function footspaReferenceFile(root,id,kind){
  if(!FOOTSPA_REFERENCE_CATALOG.clips.some(c=>c.id===id)||!['video','poster'].includes(kind))return null;
  const file=path.join(root,'data','footspa-references',id+(kind==='video'?'.mp4':'.jpg'));
  return fs.existsSync(file)?file:null;
}
export function footspaKeyframePrompt(template,{ratio='9:16',personImages=false,index=1,monitorFrame=false}={}){
  const start=template.startPose||loadActionTemplates().find(a=>a.id===template.id)?.startPose;
  const identities=personImages?'优先保持上传的对应成年人物面容和穿搭，未提供参考的角色使用自然得体造型。':makeCharacters(template,index).map((c,i)=>`人物${i+1}：${c.appearance}，${c.clothing}。`).join('');
  const scene=template.sceneTags.includes('stairs')?'可见台阶与连续扶手的门店楼梯':template.sceneTags.includes('reception_desk')?'真实门店前台和连续通道':template.sceneTags.includes('lobby')?'真实门店大厅和可用活动区域':'真实门店走廊';
  return `${ratio}画幅，真实摄影，固定高位俯拍的模拟监控视角静态视频首帧。场景为${scene}；${monitorFrame?'附件已是监控首帧，锁定原有构图、机位、门与通道位置。':'附件仅作真实门店场景参考，把平拍视角重构为墙角高位固定监控机位，轻微广角；保持装修、门与通道的相对布局、光线与物件，不照搬原平拍机位。'}保持画面清晰，不添加假时间戳、监控边框、噪点或模糊滤镜。画面严格包含${template.people}位成年人。${identities}\n只表现动作尚未完成的起始状态：${start}。双脚落在真实地面或台阶上，手部自然，保留必要的可行走路线。人物参考提供身份，不能把肖像背景当成门店；不复制参考图中多余的人。只生成这一张起始画面，不做故事板或拼图，不画动作轨迹、结尾画面、字幕或水印。`;
}
export function footspaActionPrompt(template,{duration=6,ratio='9:16',personImages=false,index=1}={}){
  const seconds=Number(duration);if(!Number.isFinite(seconds)||seconds<2||seconds>15)throw Error('动作时长须为2–15秒');
  const characters=makeCharacters(template,index).map((c,i)=>`人物${i+1}：${personImages?`${c.role==='adult_male_guest'?'成年男性顾客':'成年女性工作人员'}，优先保持对应人物参考图中的面容与穿搭；该角色没有对应参考图时使用自然得体的日常造型`:`${c.appearance}，${c.clothing}`}`).join('；');
  const tags=template.sceneTags||[];
  const scene=tags.includes('stairs')?'真实门店楼梯，台阶和扶手连续可见':tags.includes('reception_desk')?'真实门店前台与连续通道':tags.includes('lobby')?'真实门店大厅与可用活动区域':'真实门店走廊与可行走通道';
  const b1=+(seconds*.2).toFixed(1),b2=+(seconds*.8).toFixed(1);
  const startPose=template.startPose||loadActionTemplates().find(a=>a.id===template.id)?.startPose||'人物处于核心动作开始前的合理位置，留出连续的行动路线。';
  return `${seconds}秒，${ratio}，单一连续镜头。固定高位俯拍，全程机位、透视、焦距不变。\n场景：${scene}。有底图时只使用底图中确认存在的空间、门和物件，保持装修、光线与通道位置。\n${personImages?'人物参考图锁定对应成年人物身份；人数与角色严格按以下模板，不复制参考图中的多余人物。':'未提供人物图，按以下设定创建人物。'}${characters}。\n起始画面（0–${b1}秒）：${startPose}\n核心动作（${b1}–${b2}秒）：${template.actionText}\n收尾（${b2}–${seconds}秒）：${template.endState}。\n动作自然连续，脚步与地面接触正确，人物相互不穿透；门扇只围绕真实铰链运动。距离较远时缩短行走路程，不加速、不瞬移；时间不足只精简停顿，不改变进入顺序或结束状态。\n自然门店记录质感，保持底图清晰度与色彩，允许轻微压缩感，不额外叠加模糊滤镜。已有时间戳保持稳定，无新增字幕、标识或抖音片尾。不照搬原作人物面容、装修或音乐。轻微脚步与环境声，无清晰人声或对白；如需要配乐，使用舒缓无歌词音乐。`;
}
