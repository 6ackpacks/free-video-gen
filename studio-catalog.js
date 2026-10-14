import {SERVICE_RECIPES} from './service-recipes.js';
import {templateArtwork} from './template-art.js';
import {workflowRecipesForGroup} from './studio-workflow-recipes.js';

export const INDUSTRIES = [
  {id:'footspa',name:'足浴养生'}, {id:'massage',name:'按摩护理'}, {id:'ktv',name:'KTV'},
  {id:'jewelry',name:'珠宝'}, {id:'food',name:'餐饮'}, {id:'homecare',name:'家政'}
];
export function defaultType(t) {
  if(t.catalogType)return t.catalogType;
  if(t.source==='replica'||t.replica)return `replica:${t.originId||t.id}`;
  if(t.scene==='footspa')return 'footspa:monitor';
  if(t.scene==='massage')return 'massage:service';
  if(t.scene==='ktv')return 'ktv:interaction';
  if(t.scene==='story')return 'story:story';
  return `${t.scene||'general'}:custom`;
}
export function catalogSeeds(industries=INDUSTRIES) {
  const result=[];
  for(const industry of industries) {
    for(const category of ['environment','service']) {
      const actions=category==='environment'?[
        ['空间全景','以固定镜头展示真实空间全景、布局、装修与光线，人物自然走过，不改变建筑结构。'],
        ['细节展示','以近景展示真实环境中的陈设、设施或产品细节，保持物品外观一致。'],
        ['动线展示','固定机位拍摄人物沿真实空间的通道移动，展示服务动线，不新增门或通道。']
      ]:SERVICE_RECIPES.map(v=>[v.name,v.rule]);
      actions.forEach(([name,description],i)=>result.push({id:`catalog:${industry.id}:${category}:${i+1}`,scene:industry.id,catalogType:`${industry.id}:${industry.id==='massage'&&category==='service'?'product-service':category}`,industryId:industry.id,...(category==='service'?{serviceRecipeId:SERVICE_RECIPES[i].id}:{}),name,description:`${industry.name}：${description}`,actions:[description],people:'自然得体的成年人',duration:10,mapping:'common',imageRules:'使用用户确认的环境、产品或人物素材；保留主体外观和空间结构。'}));
    }
    result.push({id:`catalog:${industry.id}:avatar-talk:1`,scene:industry.id,catalogType:`${industry.id}:avatar-talk`,industryId:industry.id,name:'商品口播',description:'成年人物固定场景面对镜头，持有真实商品，按用户确认的台词自然介绍产品，脸部与商品清晰可见。',actions:['固定场景面对镜头自然说话并展示商品'],people:'自然得体的成年讲解者',duration:10,mapping:'common',imageRules:'产品外观、人物身份与场景保持一致；初始画面须同时包含人物和商品。'});
  }
  return result;
}
export function buildCatalog(templates,customIndustries=[]) {
  const industries=[...INDUSTRIES,...customIndustries.filter(i=>!INDUSTRIES.some(b=>b.id===i.id))];
  const types=[];
  for(const industry of industries) {
    const add=(id,name,description,special=false)=>{
      const actions=templates.filter(t=>!t.archived&&defaultType(t)===id);
      types.push({id,industryId:industry.id,name,description,special,source:actions.some(t=>t.source==='builtin')?'builtin':'my',scene:actions[0]?.scene||industry.id,actionIds:actions.map(t=>t.id),image:industry.id==='massage'?'/design-assets/scene-massage.webp':industry.id==='ktv'?'/design-assets/scene-ktv.webp':'/design-assets/scene-footspa.webp',materials:'需要环境、人物或产品素材',goal:special?'arrival':id.endsWith(':environment')?'trust':'service'});
    };
    if(industry.id==='footspa')add('footspa:monitor','监控视角获客','固定环境与监控机位，按所选动作分别批量制作。',true);
    if(industry.id==='ktv')add('ktv:interaction','KTV互动获客','包厢互动、大厅接待等行业特色动作，分别生成视频。',true);
    if(industry.id==='massage')add('massage:service','上门按摩护理','普通家庭中的手机随手拍与顾客第一视角，按所选护理构图和动作分别制作。',true);
    add(`${industry.id}:environment`,'环境展示','展示门店环境、设施与空间细节，建立真实印象。');
    add(`${industry.id}:${industry.id==='massage'?'product-service':'service'}`,industry.id==='jewelry'?'产品展示':'服务展示','展示实际服务过程或产品亮点，内容由你确认。');
    types.push({id:`${industry.id}:avatar-talk`,industryId:industry.id,name:'数字人商品口播',description:'固定人物与商品，可选择模型口播或配音驱动对口型。',source:'builtin',scene:industry.id,actionIds:templates.filter(t=>!t.archived&&defaultType(t)===`${industry.id}:avatar-talk`).map(t=>t.id),image:'/design-assets/scene-story.webp',materials:'产品图片、人物图片、口播稿与场景参考',goal:'service'});
    const stories=templates.filter(t=>!t.archived&&t.scene==='story'&&!t.replica);
    types.push({id:`${industry.id}:story`,industryId:industry.id,name:'短剧获客',description:'用已确认的品牌资料制作短剧获客、对话与剧情。',source:'builtin',scene:'story',actionIds:stories.map(t=>t.id),image:'/design-assets/scene-story.webp',materials:'需要品牌资料、脚本与分镜素材',goal:'trust'});
  }
  for(const t of templates.filter(t=>!t.archived&&(t.replica||t.source!=='builtin'&&t.scene!=='story'))) {
    const id=defaultType(t);if(types.some(type=>type.id===id)){const type=types.find(type=>type.id===id);if(!type.actionIds.includes(t.id))type.actionIds.push(t.id);continue;}
    types.push({id,industryId:t.industryId||t.scene||'general',name:templates.find(a=>!a.archived&&defaultType(a)===id&&a.catalogName)?.catalogName||(t.replica?t.name:'我的制作方案'),description:t.description,source:t.source,scene:t.scene,actionIds:templates.filter(a=>!a.archived&&defaultType(a)===id).map(a=>a.id),image:'/design-assets/replica-tech.webp',materials:'按方案准备素材与内容',goal:'arrival'});
  }
  const labels={environment:'环境展示',service:'服务／产品展示',story:'短剧获客','avatar-talk':'数字人商品口播','massage-care':'按摩护理展示',monitor:'监控视角获客',interaction:'KTV互动获客',replica:'复刻方案',custom:'自建模板'};
  const templateTypes=types.filter(type=>type.actionIds.length||type.workflowOnly).map(type=>{const suffix=type.id.split(':').at(-1);const categoryId=type.industryId==='massage'&&type.special?'massage-care':suffix==='product-service'?'service':type.id.startsWith('replica:')?'replica':Object.hasOwn(labels,suffix)?suffix:'custom';return {...type,categoryId,categoryName:labels[categoryId],image:templateArtwork({...type,categoryId})};});
  const templateCategories=Object.entries(labels).map(([id,name])=>({id,name})).filter(c=>templateTypes.some(t=>t.categoryId===c.id));
  return {industries:[...industries,{id:'general',name:'通用方案'}],templateTypes,templateCategories,templateGroups:groupTemplateTypes(templateTypes)};
}

// Public catalog entries are shared types; industry variants remain execution details.
export function groupTemplateTypes(types) {
  const groups=new Map();
  for(const type of types){
    const common=type.source==='builtin'&&!type.special&&['environment','service','story','avatar-talk'].includes(type.categoryId);
    const id=common?'common:'+type.categoryId:type.id;
    if(!groups.has(id))groups.set(id,{id,name:common?({environment:'环境展示',service:'服务／产品展示',story:'短剧获客','avatar-talk':'数字人商品口播'})[type.categoryId]:type.name,categoryId:type.categoryId,categoryName:type.categoryName,source:type.source,special:!!type.special,shared:common,workflowOnly:!!type.workflowOnly,description:type.description,materials:type.materials,image:type.image,goal:type.goal,industryIds:[],variantIds:[]});
    const group=groups.get(id);if(!group.industryIds.includes(type.industryId))group.industryIds.push(type.industryId);group.variantIds.push(type.id);
  }
  return [...groups.values()].map(group=>({...group,workflowRecipes:workflowRecipesForGroup(group.id)}));
}
