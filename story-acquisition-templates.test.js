import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ACQUISITION_STRATEGY,ACQUISITION_TEMPLATES,ACQUISITION_HOOKS,acquisitionVariant,acquisitionBatchTemplate} from './story-acquisition-templates.js';
import {STORY_TEMPLATES,STORY_STRATEGIES,StoryLibrary} from './story-library.js';
import {draftSelectedStoryPrompts,planStoryVideoJobs} from './story-prompts.js';
import {StudioDomain} from './studio-domain.js';
import {StudioService,studioSeeds} from './studio-service.js';

test('附加八个顾客故事模板，原目录逐项保留',()=>{
  const original=JSON.parse(fs.readFileSync(new URL('./story-template-catalog.json',import.meta.url),'utf8'));
  assert.deepEqual(STORY_TEMPLATES.slice(0,original.templates.length),original.templates);
  assert.deepEqual(STORY_STRATEGIES.slice(0,original.strategies.length),original.strategies);
  assert.equal(ACQUISITION_TEMPLATES.length,8);
  assert.equal(new Set(STORY_TEMPLATES.map(t=>t.id)).size,STORY_TEMPLATES.length);
  assert.equal(ACQUISITION_HOOKS.length,16);
  assert.ok(STORY_STRATEGIES.some(t=>t.id===ACQUISITION_STRATEGY.id&&t.status==='active'));
});

test('旧模板不注入新规则，新模板可通过原知识库选择',t=>{
  const old=STORY_TEMPLATES.find(t=>t.id==='legacy-surveillance');
  assert.equal(acquisitionVariant(old,0),'');
  assert.equal(acquisitionBatchTemplate(old,5),old);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'customer-story-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const lib=new StoryLibrary(path.join(dir,'subjects.json'));
  const subject=lib.save({name:'青禾足浴',materials:'提供足浴服务，接受预约'});
  const resolved=lib.resolve({subjectId:subject.id,templateIds:ACQUISITION_TEMPLATES.map(t=>t.id)});
  assert.equal(resolved.templates.length,8);
  assert.ok(resolved.templates.every(t=>t.sceneId==='reenactment'&&t.format==='timeline'));
});

test('十条短剧跨分批保持差异计划，沿用四段结构和原视频任务',async()=>{
  const calls=[];
  const provider={draftStoryPrompts:async input=>{
    calls.push(input);
    const offset=input.template.rules.includes('【第6条差异计划】')?5:0;
    return {items:Array.from({length:input.count},(_,i)=>({
      title:'顾客故事'+(offset+i),characters:'甲：成年顾客，黑色短发、蓝色上衣；乙：成年店员，束发、灰色制服',
      scene:'门店接待处',factsUsed:['提供足浴服务'],
      beats:Array.from({length:4},(_,n)=>({action:`顾客${offset+i}观察细节${n}`,camera:'中景',dialogue:n===3?'乙：青禾足浴提供足浴服务。':'',sound:'门店环境声'}))
    }))};
  }};
  const template=ACQUISITION_TEMPLATES[0],rules=template.rules;
  const result=await draftSelectedStoryPrompts({count:10,duration:15,brandName:'青禾足浴',brief:'提供足浴服务',templates:[template]},provider);
  assert.equal(result.items.length,10);
  assert.equal(calls.length,2);
  for(let n=1;n<=10;n++)assert.ok(calls.some(c=>c.template.rules.includes(`【第${n}条差异计划】`)));
  assert.equal(template.rules,rules);
  assert.ok(result.items.every(i=>i.beats.length===4&&i.beats.at(-1).end===15));
  const jobs=planStoryVideoJobs({items:result.items,resolution:'720P'},{id:'wan-test',name:'Wan',model:'wan',configured:true,duration:{min:15,max:30},resolutions:['720P']});
  assert.equal(jobs.length,10);
  assert.ok(jobs.every(j=>j.skillId==='story-ad'&&j.lockedPrompt&&j.duration===15));
});

test('工作台新模板自动入库，已有模板与项目不被更新',t=>{
  const seeds=studioSeeds({state:{presets:[]}},[]).templates;
  const additions=seeds.filter(t=>t.storyTemplate?.strategyId===ACQUISITION_STRATEGY.id);
  assert.equal(additions.length,8);
  assert.ok(additions.every(t=>t.scene==='story'&&t.mapping==='shots'&&!t.packId));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'customer-seeds-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'studio.json');
  const domain=new StudioDomain(file,[{id:'existing',name:'原模板',description:'保留用户内容',scene:'footspa'}]);
  domain.state.projects.push({id:'existing-project',plans:[]});domain.save();
  const reloaded=new StudioDomain(file,additions);
  assert.equal(reloaded.template('existing').description,'保留用户内容');
  assert.deepEqual(reloaded.state.projects,[{id:'existing-project',plans:[]}]);
  assert.equal(reloaded.state.templates.length,9);
  assert.equal(new StudioDomain(file,additions).state.templates.length,9);
});

test('工作台实际改写请求携带每条差异规则并保留用户资料',async()=>{
  const template=ACQUISITION_TEMPLATES[1];let request;
  const plan={id:'plan',templateId:'story:'+template.id,count:2,duration:15,signature:'same',imageIds:[],mapping:'shots',prompts:[],snapshot:{name:template.name,description:template.rules,storyTemplate:template,actions:[],people:'两位成年人',imageRules:'参考图约束外观'}};
  const project={id:'project',scene:'story',brandName:'青禾足浴',brandFacts:'提供足浴服务',materials:{},plans:[plan]};
  const service=Object.create(StudioService.prototype);
  service.domain={project:()=>project,save:()=>{}};
  service.references={get:()=>({})};
  service.provider={routes:[],rewritePrompts:async input=>{request=input;return {items:input.items.map(i=>({...i,prompt:'已生成 '+i.prompt}))}}};
  service.project=()=>project;
  await service.generate(project.id);
  assert.equal(request.mode,'story');
  assert.match(request.items[0].prompt,/第1条差异计划/);
  assert.match(request.items[1].prompt,/第2条差异计划/);
  assert.match(request.items[0].prompt,/青禾足浴/);
  assert.equal(plan.prompts.length,2);
});
