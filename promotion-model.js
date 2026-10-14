import {SERVICE_RECIPES} from './service-recipes.js';
// Promotional facts are reusable; presentation templates only decide how to show them.
export const DISPLAY_FORMATS = {
  environment: [
    {id:'space',name:'空间全景',summary:'先看主要空间，再聚焦一处真实环境亮点。',rule:'平稳缓慢推进或小幅平移，展示参考图可见的空间层次；以一处已确认设施收尾。'},
    {id:'detail',name:'设施细节',summary:'用细节说明环境为什么值得来。',rule:'近景展示一处真实设施的材质与用途，镜头运动幅度小；画面证明所选卖点。'},
    {id:'tour',name:'人物带逛',summary:'由本行业工作人员带镜头参观门店，边走边介绍真实设施。',people:1,speech:true,rule:'一位本行业成年工作人员作为带逛者，把镜头当作到店顾客；先面向镜头招呼并作出邀请手势，再侧身慢走引导镜头跟随，到参考环境中一处真实设施旁停下，指向设施并用简短中文说明它的用途或已确认卖点。不是顾客闲逛、模特摆拍或站着微笑。使用连续跟拍，人物与设施同时可辨；仅在参考图支持的同一可见区域移动，不虚构相邻房间。'},
    {id:'pov',name:'第一视角体验',summary:'模拟顾客进入、停留和观察的感受。',rule:'人眼高度的小幅平稳移动，沿图片可见区域观察一个环境细节，不凭空扩建空间。'},
    {id:'dialogue',name:'问答看环境',summary:'用一个顾客问题介绍一个环境特点。',people:2,speech:true,rule:'一位顾客提出一个短问题，工作人员用一句已确认事实回答并指示对应设施；两人站位稳定，交替说话。'}
  ],
  service: [
    ...SERVICE_RECIPES,
    {id:'intro',name:'人物介绍',summary:'让工作人员讲清提供什么服务。',people:1,speech:true,rule:'工作人员面对镜头，用一句自然口语介绍一项服务及一个已确认卖点，配合一次简洁指示动作，不强制持有商品。'},
    {id:'process',name:'过程展示',summary:'让观众看到一个真实服务步骤。',rule:'展示用户已确认服务流程中的一个关键步骤；明确执行者、对象、工具和接触位置，不在短时长内塞入完整复杂流程。'},
    {id:'dialogue',name:'顾客问答',summary:'回答顾客最关心的一个问题。',people:2,speech:true,rule:'顾客问一个与已确认资料有关的问题，工作人员给出简短具体回答；角色发言清晰，不编造评价或服务效果。'},
    {id:'journey',name:'跟随体验',summary:'沿顾客的一次服务体验展示价值。',rule:'只拍当前时长能完成的一段顾客体验，按用户提供的真实步骤自然衔接；不杜撰结果、顾客感言或空间连接。'},
    {id:'benefit',name:'卖点实证',summary:'用动作与细节展示一项产品或服务优势。',rule:'选一个有资料支持的卖点，用实际操作或产品可见细节作为证据；不虚构实测、前后对比、疗效、销量和价格。'}
  ]
};
export function promotionCategory(project){
  const suffix=project.templateTypeId?.split(':').at(-1);
  return suffix==='environment'?'environment':['service','product-service'].includes(suffix)&&project.templateTypeId!=='massage:service'?'service':'';
}
const txt=(v,n=2000)=>String(v??'').trim().slice(0,n);
function date(v){const s=txt(v,10);if(!s)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('活动日期无效');return s;}
export function normalizePromotion(value={}){
  const startDate=date(value.startDate),endDate=date(value.endDate);
  if(startDate&&endDate&&endDate<startDate)throw Error('活动结束日期不能早于开始日期');
  return {enabled:value.enabled===true,name:txt(value.name,100),audience:txt(value.audience,300),sellingPoints:txt(value.sellingPoints),copy:txt(value.copy,4000),serviceProcess:txt(value.serviceProcess),cta:txt(value.cta,300),personRole:txt(value.personRole,300),voice:txt(value.voice,200),startDate,endDate};
}
export function displayFormat(category,id){return DISPLAY_FORMATS[category]?.find(v=>v.id===id)||DISPLAY_FORMATS[category]?.[0];}
export function presentationDirection(project,plan){
 const category=promotionCategory(project),f=displayFormat(category,plan.displayFormat),b=project.promotion||{},seconds=Number(plan.duration)||10;
 const budget=Math.max(4,Math.floor((seconds-2)*3));
 const voice=f?.speech?'讲解由画面中的工作人员发声，嘴型和中文同步；对白放在双引号中，总计不超过'+budget+'个汉字，自然语速，台词讲到的设施必须在画面里。背景声低于人声，不叠加第二个旁白。':'轻微真实环境声，可配低音量背景音乐，让操作和空间细节成为重点。';
 if(f?.id==='tour')return '工作人员身份：'+(b.personRole||'这家门店的本行业工作人员，着与职业匹配的整洁工作服')+'。保持同一成人身份与服装。镜头顺序：开场中景，工作人员看向镜头、自然招呼并抬手邀请；中段工作人员侧身带路，缓慢走两三步，镜头以到店顾客眼高平稳跟随，脸部和环境均可辨；末段在一个已确认设施旁停下，工作人员指向它，镜头顺势小幅转向设施并停留，同时用一句话介绍用途或卖点。'+(seconds<8?'短时长只保留邀请、一步引导和一句介绍，不强塞完整参观。':'以一个连贯镜头完成，不用空镜替代带逛动作，不切成跨房间蒙太奇。')+voice;
 return (category==='environment'?'镜头顺序：开场清楚展示参考环境的主体空间；中段用一次平稳推进或平移展示所选设施及其与空间的关系；末段停留在可证明卖点的真实细节。保持门窗、通道和设施位置一致。':'镜头顺序：开场看清服务对象或产品；中段按已确认步骤展示一个关键操作，明确工作人员的手、工具与服务对象如何配合；末段展示该步骤完成后的真实可见状态，不拍未经证实的效果对比。')+'信息量按'+seconds+'秒精简。'+voice;
}
export function promotionVideoPrompt(project,plan){
  const b=project.promotion,format=displayFormat(promotionCategory(project),plan.displayFormat),m=project.materials||{};
  const lines=[`${plan.duration}秒，${plan.ratio||'9:16'}，制作${promotionCategory(project)==='environment'?'真实环境展示':'服务／产品展示'}短片。宣传主体：${b.name}。`,
    presentationDirection(project,plan),
    `表现方式：${format.name}。${format.rule} 一个重点，开场展示主体，中段展示可见证据，收尾自然停留；动作和台词必须在时长内完成。`,
    `已确认卖点：${b.sellingPoints}。${b.serviceProcess?'真实服务步骤：'+b.serviceProcess+'。本条只展示其中一个可完成的关键步骤。':''}`,
    b.copy?`宣传文字：${b.copy}。根据镜头和时长选择一句核心表达，保留原文事实，不增加承诺。`:'从已确认卖点选择一个重点，不编造宣传事实。',
    `参考素材保持真实空间、设施和产品外观；${m.personImageIds?.length&&plan.referenceMode==='reference-image'?'人物图锁定同一人物身份与穿搭，不随机换人。':'人物按用户要求：'+(b.personRole||'自然得体的成年工作人员')+'。'}${format.people===2?'顾客与工作人员明确区分，轮流说话。':''}`,
    format.speech?`自然清晰中文，${b.voice||'温和自然语气'}，只说在当前时长内能自然完成的短句，画面与讲解对应。`:'画面为主，自然环境声，不强制人物说话。',
    b.cta?'收尾行动：'+b.cta+'。':'',b.startDate||b.endDate?`活动日期：${b.startDate||'未指定'}至${b.endDate||'未指定'}，只用于宣传内容，不作为监控时间戳。`:'',
    '保持图片中可见的空间，不新增门窗或房间。不虚构价格、功效、资质、实测结果或顾客评价。不套用监控噪点、暧昧互动或随机时间戳。准确品牌文字与标志不依赖模型重绘。',plan.creativeBrief||''];
  const prompt=lines.filter(Boolean).join('\n');
  if(prompt.length>1650)throw Error('宣传资料过长，请精简本条卖点和宣传文字后生成视频');
  return prompt;
}
export function promotionPrompt(project,plan){
  const category=promotionCategory(project);if(!category||!project.promotion?.enabled)return '';
  const b=project.promotion,format=displayFormat(category,plan.displayFormat),m=project.materials||{};
  return [
    `宣传任务：${category==='environment'?'环境展示，帮助观众认识真实场所与到店体验':'服务／产品展示，帮助观众看懂提供什么、如何完成、有什么价值'}。主体：${b.name}。目标观众：${b.audience||'对本服务感兴趣的潜在顾客'}。`,
    `表现模板：${format.name}。${format.rule} 每条${plan.duration}秒、${plan.ratio||'9:16'}，围绕一个主要信息安排吸引注意→画面证明→简洁收尾；短片时长不足时减少信息，不加速堆叠动作。`,
    presentationDirection(project,plan),
    `素材角色绑定：环境图=${(m.sceneImageIds||[]).join(',')||'本条底图'}；产品／服务图=${(m.productImageIds||[]).join(',')||'本条底图'}；人物图=${(m.personImageIds||[]).join(',')||'未指定真实人物'}。身份、包装、颜色、装修、门窗位置保持参考一致。人物图不是场景图，产品图不是背景图。`,
    `已确认卖点：${b.sellingPoints}。服务步骤：${b.serviceProcess||'仅展示用户资料或图片能证实的动作'}。人物身份与职责：${b.personRole||'按素材与模板指定'}。`,
    b.copy?`宣传原文：${b.copy}。保留关键事实；如需精简为口播，不能添加承诺、价格或未经确认的信息。`:'根据已确认卖点自动写一句自然宣传文案，不要求用户编写提示词。',
    `声音：${format.speech?'明确角色台词与发言顺序，按可自然说完的时长精简；'+(b.voice||'清晰自然中文'):'以画面为主；没有确认口播时不强制人物说话'}。`,
    b.cta?`收尾行动：${b.cta}。`:'以主体或已确认亮点收尾，不编造联系方式。',
    b.startDate||b.endDate?`活动有效日期：${b.startDate||'未指定开始'}至${b.endDate||'未指定结束'}，仅在文案需要活动日期时使用，不渲染成监控时间戳。`:'',
    '最终视频描述不超过1200汉字，优先保证已确认事实、关键动作与声音。只输出可直接提交的视频描述，明确主体动作、镜头运动、节奏与声音。没有用户要求时不套监控画质、随机日期、暧昧互动或人物随机换装。品牌文字、电话号码、日期与标志不要依赖模型逐字重绘；本流程尚无自动品牌图层合成，不声称已完成。'
  ].filter(Boolean).join('\n');
}
export function promotionErrors(project,references,routes=[]){
  if(!project.promotion?.enabled)return [];
  const b=project.promotion,m=project.materials||{},category=promotionCategory(project),errors=[];
  if(!b.name)errors.push('请填写宣传主体名称');
  if(!b.sellingPoints)errors.push('请填写已确认的环境或服务卖点');
  if(category==='environment'&&!m.sceneImageIds?.length)errors.push('请添加真实环境图');
  if(category==='service'&&!m.productImageIds?.length&&!m.sceneImageIds?.length)errors.push('请添加产品、服务过程或服务场景图片');
  for(const plan of project.plans||[]){
    const format=displayFormat(category,plan.displayFormat);if(!format)continue;
    if(format.people&&!m.personImageIds?.length&&!project.peopleBrief&&!b.personRole)errors.push('人物模板请添加人物图或填写人物身份与形象');
    if(format.speech&&routes.length&&!routes.find(r=>r.id===plan.videoRoute)?.nativeAudio)errors.push('人物介绍或问答模板需要支持原生声音的生成服务');
  }
  for(const id of Object.values(m).flat()){try{references.get(id);}catch{errors.push('预设引用的素材已不存在，请重新添加');}}
  return [...new Set(errors)];
}
