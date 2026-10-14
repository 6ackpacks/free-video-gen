import {FEMALE_WARDROBE_RULES} from './wardrobe-rules.js';
import {DEFAULT_VIDEO_BGM} from './paired-prompts.js';

export const HOME_MASSAGE_PHOTOS=[
 {id:'home-pov-full',name:'上门足部护理 · 第一视角全景',shot:'严格顾客第一人称手机视角，顾客双腿和双脚位于下方前景，技师面部、上半身和双手清楚可见，双手正在承托与按摩其中一只脚。'},
 {id:'home-pov-side',name:'上门足部护理 · 侧向随手拍',shot:'顾客第一人称略偏侧面的随手拍角度，一只脚和部分小腿进入画面下缘，技师面部、上半身和按摩双手完整可见。'},
 {id:'home-pov-close',name:'上门足部护理 · 人物近景',shot:'顾客第一人称胸口高度近景，技师面部与专注神态清楚，正在按摩的脚位于画面下角，双手与脚的接触关系明确。'},
 {id:'home-pov-crop',name:'上门足部护理 · 人物抓拍',shot:'顾客第一人称近景抓拍技师面部、穿搭和向下工作的双手，脚部可以位于画面下缘之外；仍须通过身体前倾、双手位置和向下视线表达她正在给顾客做足部护理。'}
];
export function homeMassageImagePrompt(p,plan){
 const spec=p.massageSpec||{},photo=HOME_MASSAGE_PHOTOS.find(v=>v.id===plan.snapshot.actionId),foot=!!photo||['foot-care','foot-massage-continuous'].includes(plan.snapshot.actionId);
 const bed=spec.homeScene==='bed';
 const room=bed?'普通中国家庭卧室，家用床、床头柜、枕头、衣柜与窗帘可见':'普通中国家庭客厅，布艺沙发、茶几、电视柜、窗帘与生活用品可见';
 const placement=bed?'成年顾客躺靠在家用床上，技师坐在床尾或床边的普通家用椅子上':'成年顾客靠坐在家用沙发上，技师坐在沙发前的普通家用小凳上';
 return [
  `真实手机随手拍质感，${plan.ratio||'9:16'}，上门按摩服务照片。${room}，自然家用灯光与真实织物褶皱，不做影棚或统一样板间。`,
  '只生成一张完整单幅照片，一个连续家庭空间；不生成九宫格、拼图、三联画、重复人物或并排机位。界面封面的九宫格不是服务底图的构图要求。',
  foot?`${placement}。${photo?.shot||HOME_MASSAGE_PHOTOS[0].shot}`:`在上述家庭场景中保留两名成年人的真实护理关系；${plan.content||plan.snapshot.description}。自然手机旁观视角，护理部位和双手接触位置明确。`,
  p.materials?.personImageIds?.length?'人物图只用于锁定技师的成年人物身份、脸型、发型与穿搭；不把人物肖像当成环境。':'一位22–32岁的年轻成年亚洲女性上门技师，自然得体穿搭、专注表情。'+FEMALE_WARDROBE_RULES,
  p.peopleBrief?'用户人物要求：'+p.peopleBrief:'',
  p.materials?.sceneImageIds?.length?'家庭场景附件是房间与家具布局的依据，保留已有空间，不新增门店元素。':'',
  foot?'双手专业自然地承托与按摩足部，身体略向前，手指和腿脚结构准确；顾客不必在画面里露脸。':'按明确的护理部位与起始姿态保持正确接触，不把肩颈、手臂或背部护理改成足部动作。',
  spec.position?'起始姿态补充：'+spec.position:'',spec.contact?'接触要求：'+spec.contact:'',
  spec.brandText?`胸牌文字仅使用用户提供的“${spec.brandText}”，不添加其他品牌；文字准确性需在结果中核对。`:'不自作主张添加品牌、胸牌文字或宣传标志。',
  '不要会所足浴椅、护理店装修、专业足部凳、护理瓶罐堆放、酒店式灯光、裸露私密部位或多余肢体。无水印。',plan.creativeBrief||''
 ].filter(Boolean).join('\n');
}
export function homeMassageVideoPrompt(p,plan){
 const foot=HOME_MASSAGE_PHOTOS.some(v=>v.id===plan.snapshot.actionId)||['foot-care','foot-massage-continuous'].includes(plan.snapshot.actionId);
 return [`${plan.duration}秒，${plan.ratio||'9:16'}，普通中国家庭里的上门按摩护理，单一连续镜头。`,
  foot?'顾客第一人称手机视角，技师在顾客腿前持续专业足部按摩。任一时刻至少一只手接触、承托或按摩脚部，小幅连续动作。':'按已确认家庭底图、人物起始姿态与护理部位，完成一个自然连续的护理动作：'+(plan.content||plan.snapshot.description),
  plan.referenceMode==='first-frame'?'从用户已确认的完整起始底图开始动作，不先重新生成这张图。':'附件用于人物、服装、家庭空间与服务关系参考，不要求照搬参考图中的静止姿势。',
  '全程保持同一人物、穿搭、家庭空间、服务关系和视角。不变成会所、门店或第三人称广告拍摄；双手和腿脚结构准确，不突然停手、转身或换人。',
  p.massageSpec?.brandText?'保持用户已提供胸牌标记，不重绘无关文字。':'不生成未经提供的品牌文字。',
  DEFAULT_VIDEO_BGM,plan.creativeBrief||''
 ].filter(Boolean).join('\n');
}
export function upgradeHomeMassageTemplates(templates,seeds){
 for(const seed of seeds.filter(t=>t.packId==='home-massage')){
  const current=templates.find(t=>t.id===seed.id);if(!current||current.source!=='builtin'||current.homePhotoVersion===1)continue;
  current.imageRules=seed.imageRules;current.homePhotoVersion=1;current.version=(current.version||1)+1;
  (current.versions||=[]).push({...structuredClone(current),versions:undefined,createdAt:new Date().toISOString()});
 }
}
