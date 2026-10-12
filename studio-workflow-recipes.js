// Imported workflow specifications are reference plans, not executable action seeds.
// Model names describe the supplied sources; availability must be checked by an adapter.
export const WORKFLOW_RECIPES = [
  {
    id:'product-commercial', name:'商品宣传短片', source:'Flova · 商品宣传短片',
    summary:'以产品为主角，通过使用场景、卖点特写和配乐组成完整广告。',
    inputs:['真实产品图片','产品名称与确认过的卖点','品牌素材（可选）'],
    decisions:['比例与成片时长','视觉风格','文案与输出语言'],
    stages:['确认视频规格','确认故事板与至少两个使用场景','绑定产品素材并准备场景图','按分镜生成视频','准备配音与音乐','剪辑、品牌叠加并导出'],
    rules:['复用用户提供的产品素材，保持包装、颜色和外观一致。','视频生成与后期音乐分开，避免重复配音或配乐。','镜头时长由实际模型能力决定。'],
    confirmationPoints:['视频规格','故事板','元素素材','镜头视频','音频与成片'],
    sourceModels:['Nano Banana / Nano Banana Pro','Seedance 2.5'],
    missingCapabilities:['故事板任务编排','来源模型适配','配音与音乐生成','多镜头音画合成'],
    execution:'independent-shots', output:'多个镜头合成为一条成片'
  },
  {
    id:'avatar-product-talk', name:'数字人商品口播', source:'Flova · 数字人商品口播',
    summary:'人物面对镜头介绍产品，使用同一场景与关键帧，由配音驱动口型。',
    inputs:['真实产品图片','产品卖点或完整口播稿','人物参考图或人物要求'],
    decisions:['人物与声音','单一主场景','比例与输出语言','口播文案'],
    stages:['确认视频规格与口播稿','确认人物、产品与场景','生成并确认一张合成关键帧','生成配音并按完整句子分段','同一关键帧配合音频生成口播','按配音时间线拼接并导出'],
    rules:['全片固定场景、构图和关键帧，不增加机位切换。','人物脸部与产品均清晰可见，优先中近景。','配音决定分段；来源建议单段不超过15秒，执行前检查实际限制。','音频驱动能力不能由普通图生视频替代。','没有真实产品图时只可做明确标注的演示。'],
    confirmationPoints:['视频规格与文案','人物与关键帧','配音','口播视频','成片'],
    sourceModels:['Nano Banana / Nano Banana Pro','OmniHuman 1.5'],
    missingCapabilities:['人物与产品关键帧合成','配音生成与分句','音频驱动口型模型','按配音时间线合成'],
    execution:'audio-driven', output:'口播分段合成为一条成片'
  },
  {
    id:'unboxing-review', name:'开箱测评种草', source:'社区 @x · 开箱测评种草广告视频',
    summary:'开箱、实际体验、总结推荐三个阶段，采用自然口语和手持拍摄感。',
    inputs:['至少一张真实产品图片','产品名称与确认过的卖点','价格和竞品信息（需要时提供）'],
    decisions:['产品品类','30 / 60 / 90秒成片时长','9:16 / 16:9','沉浸开箱 / 快节奏测评 / 对比横评 / 场景体验'],
    stages:['确认品类、风格、参数与产品信息','分析产品外观与开箱触点','确认开箱20%／体验60%／总结20%的分镜','绑定产品素材并确认视觉基调','生成各镜头视频','生成口语旁白、音乐和声音效果','叠加字幕并剪辑导出'],
    rules:['不杜撰测评结果、功效、价格或对比结论。','真实生活场景与自然光，避免过度布景。','字幕与宣传文字由后期图层添加。','来源要求多模态参考视频，不能悄悄改成不支持该流程的首帧模式。','来源的720p导出规格不代表480p原始视频获得了原生720p细节。'],
    confirmationPoints:['产品信息与参数','视频规格','分镜','视觉素材','镜头视频与成片'],
    sourceModels:['Nano Banana Pro','Seedance 2.5','MiniMax Speech / Suno / Mureka（音频）'],
    missingCapabilities:['产品素材分析与故事板','多模态来源模型适配','独立音频生成','字幕与音画时间线合成'],
    execution:'independent-shots', output:'开箱与体验镜头合成为一条成片'
  },
  {
    id:'continuous-commercial', name:'一镜到底广告', source:'社区 @やはたうみり · 【一镜到底】广告短片',
    summary:'逐段承接上一段结尾，保持人物、动作和镜头运动连续。',
    inputs:['人物、产品或场景参考素材','连续动作或故事要求'],
    decisions:['首帧衔接 / 前段视频参考','比例与成片时长','故事与输出语言'],
    stages:['确认视频规格','确认连续动作故事板','绑定并确认元素素材','生成第一段并确认','提取结尾帧或绑定上一段视频','逐段生成、逐段确认','准备音频并组装成片'],
    rules:['同一成片内严格串行；每段确认后才可开始下一段。','首帧衔接可能出现停顿；前段视频参考通常更耗时，实际费用由服务报价决定。','后段开场继承前段站位、光线、视线和摄像机状态。','重做中间段需要检查首尾衔接与下游片段；不能假定所有模式都有下一段首帧图。','缺少首尾帧或视频参考能力时，不自动切换成普通独立动作。'],
    confirmationPoints:['视频规格','故事板','元素素材','每一个视频片段','重制片段与最终成片'],
    sourceModels:['Nano Banana 2','Seedance 2.5'],
    missingCapabilities:['串行镜头编排与逐段确认','清晰末帧提取','首尾帧或前段视频参考适配','连续片段音画合成'],
    execution:'sequential-shots', output:'连续片段组成一条成片'
  }
].map(recipe=>({...recipe,parentGroupId:recipe.id==='avatar-product-talk'?'common:avatar-talk':'common:service',status:'ready',executable:true,runtime:'native-short-video'}));

export function workflowRecipesForGroup(groupId) {
  return WORKFLOW_RECIPES.filter(recipe=>recipe.parentGroupId===groupId).map(recipe=>structuredClone(recipe));
}
