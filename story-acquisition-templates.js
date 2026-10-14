// Creative-pattern adaptations, independently expressed for the existing story schema.
// Reference revision and integration scope: docs/clipforge-story-templates.md.
export const ACQUISITION_STRATEGY = {
  id:'customer-story-acquisition', name:'顾客故事 · 情节获客', status:'active',
  description:'开头吸引 → 具体顾虑 → 真实服务细节 → 自然收口。包含对话、反转、探店与沉浸展示。',
  fit:'门店服务、品牌与商品推广', adaptation:'使用当前模型、时长和制作流程，后台组合剧情、开头与人物设定。'
};

export const ACQUISITION_HOOKS = [
  ['visible-event','可见事件','以一眼能看懂的小事件开场'],
  ['question','悬念提问','提出本片随后能回答的具体问题'],
  ['contrast','预期反差','展示角色预期与眼前事实的差别'],
  ['concern','真实顾虑','直接提出目标顾客关心的一项顾虑'],
  ['before-after','状态变化','呈现有事实依据的前后状态，不夸大效果'],
  ['sound','环境声音','用场所真实声音和对应动作引出场景'],
  ['challenge','当面质疑','质疑一个能通过现场细节解释的问题'],
  ['identity','身份共鸣','从目标顾客熟悉的生活处境切入'],
  ['benefit','利益前置','先展示资料已确认的便利，没有数字就不写数字'],
  ['unexpected','意外发现','展示与预期不同但能被真实资料解释的细节'],
  ['admission','自曝误会','由角色坦白自己刚才的一次错误判断'],
  ['limitation','坦诚边界','先说真实适用边界，再展示适合的需求'],
  ['comparison','选择比较','围绕已确认的服务细节比较选择，不编造竞品'],
  ['breakdown','流程拆解','拆开真实流程解释价值，不编造价格'],
  ['reply','疑问回应','回应常见疑问，不冒充真实评论或评价'],
  ['change-mind','态度转变','让具体可见事实促成角色改变看法']
].map(([id,name,direction])=>({id,name,direction}));

const commonRules = [
  '按本次主体资料、用户想法、参考图与选定时长组织顾客故事，不套用监控模板。',
  '四段：开头事件或问题→顾虑或探索→真实细节推动理解或转折→提及完整品牌名称并自然收尾。不照抄示例对白，不强加争吵。',
  '对话模板严格两名成年人。写清每人身份、年龄段、发型、服装颜色和一个识别细节；同片外貌、声音、道具不变，跨条可以改变人物关系和情节。',
  '每段一个可见核心动作，注明发言者；用动作与表情表现态度，不只描述心理。不安排多人同时复杂操作；开始画面位于动作发生之前。',
  '镜头围绕说话人与反应安排，空间、门和道具位置连续，少切镜。按当前时长分四段，不固定25秒；台词每秒不超过约3个汉字。',
  '服务与产品只使用已确认特点，不虚构价格、活动、效果、资质、亲测经历、客户证言。收口使用资料或用户要求支持的到店、预约、咨询等行动，没有优惠资料就不用优惠催促。',
  '后台检查开头清晰度、台词时长、故事重复、因果和动作可实现性，修正后按现有结构返回，不增加问答或确认步骤。'
].join('\n');

const definitions = [
  ['mini-drama','情景短剧','顾客与店员交流一个服务问题','顾虑与现场解释','从具体小分歧进入，真实服务细节解决问题，短对白和动作收尾。',0],
  ['drama-flip','剧情反转','对门店或服务的误解得到澄清','误解与事实反差','建立错误预期，再用一个可见且已确认的细节揭晓原因；反转必须与服务有关。',2],
  ['skeptic-flip','真香反转','从质疑到了解，态度变化有依据','顾虑与选择','质疑具体，转变有真实流程支撑；不用一句真香代替理由，不冒充真实体验证言。',6],
  ['bestie-talk','闺蜜对话','朋友分享，一人推荐另一人追问','朋友同行与推荐','两位成年朋友就环境、项目或预约提问回应，用真实卖点解释选择，避免背广告。',7],
  ['office-skit','办公室情景剧','同事下班讨论放松与生活安排','下班生活与同事交流','两位成年同事从生活需求进入，把已确认服务当作选择依据，不编造治疗或即时效果。',3],
  ['store-visit','探店实测','沿顾客视线了解门店和服务','环境、接待与流程','成年顾客与店员通过观察、询问和回应展示信息；虚构情节不能包装成真实测评。',1],
  ['boss-shift','老板轮岗记','老板参与接待，展示认真细节','门店幕后与服务标准','成年负责人和顾客在接待中呈现已确认流程，没有资料就不声称真实老板出镜或真实轮岗。',10],
  ['silent-immersive','沉浸原声','用环境声音与自然动作展示服务','安静氛围与过程展示','一至两位成年人，以环境声与可见细节推进，不强行制造冲突；前三段可无对白，最后一句简短品牌口播。',5]
];

export const ACQUISITION_TEMPLATES = definitions.map(([id,name,description,fit,rule,hookStart])=>({
  id:'customer-'+id, strategyId:ACQUISITION_STRATEGY.id, sceneId:'reenactment',
  name,description,fit,format:'timeline',hookStart,acquisitionPattern:id,
  rules:commonRules+'\n【本模板结构】'+rule
}));

export function acquisitionVariant(template,index=0) {
  if(template?.strategyId!==ACQUISITION_STRATEGY.id)return '';
  const slot=Math.max(0,Math.trunc(Number(index)||0));
  const hook=ACQUISITION_HOOKS[(Number(template.hookStart||0)+slot)%ACQUISITION_HOOKS.length];
  return `【第${slot+1}条差异计划】开头：${hook.name}（${hook.direction}）。独立设计人物关系、具体问题、证明细节和收尾动作，区别于同批其他条；不为差异改变品牌事实。保持本模板结构和片内人物一致。`;
}

export function acquisitionBatchTemplate(template,count,offset=0) {
  if(template?.strategyId!==ACQUISITION_STRATEGY.id)return template;
  return {...template,rules:template.rules+'\n【本批逐条安排】\n'+Array.from({length:count},(_,i)=>acquisitionVariant(template,offset+i)).join('\n')};
}
