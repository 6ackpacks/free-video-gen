import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKFLOW_RECIPES,workflowRecipesForGroup} from './studio-workflow-recipes.js';
import {groupTemplateTypes,catalogSeeds,buildCatalog} from './studio-catalog.js';

test('产品展示容纳三个视频方向，数字人口播独立；流程不混入可执行动作',()=>{
 const types=['jewelry','food'].map(industryId=>({id:industryId+':service',industryId,categoryId:'service',source:'builtin',actionIds:['existing']}));
 const groups=groupTemplateTypes(types);
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0].variantIds,['jewelry:service','food:service']);
 assert.equal(groups[0].workflowRecipes.length,3);
 assert.ok(groups[0].workflowRecipes.every(r=>r.status==='ready'&&r.executable===true&&r.runtime==='native-short-video'));
 assert.equal(new Set(WORKFLOW_RECIPES.map(r=>r.id)).size,4);
 const seeds=catalogSeeds();const catalog=buildCatalog(seeds.map(s=>({...s,source:'builtin'})));
 assert.ok(catalog.templateTypes.flatMap(t=>t.actionIds).every(id=>seeds.some(s=>s.id===id)));
 assert.ok(catalog.templateGroups.filter(g=>!['common:service','common:avatar-talk'].includes(g.id)).every(g=>g.workflowRecipes.length===0));
});
test('流程保持独立成片与串行承接区别，读取者不能修改原始定义',()=>{
 const recipes=workflowRecipesForGroup('common:service');
 assert.equal(recipes.find(r=>r.id==='continuous-commercial').execution,'sequential-shots');
 assert.equal(workflowRecipesForGroup('common:avatar-talk')[0].execution,'audio-driven');
 recipes[0].inputs.push('changed');
 assert.ok(!workflowRecipesForGroup('common:service')[0].inputs.includes('changed'));
 assert.deepEqual(workflowRecipesForGroup('common:environment'),[]);
});
