import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogSeeds} from './studio-catalog.js';
import {SERVICE_RECIPES,upgradeServiceRecipes} from './service-recipes.js';
test('三个来源内容直接登记为服务展示内置模板，环境与数字人口播保持独立',()=>{const seeds=catalogSeeds([{id:'food',name:'餐饮'}]);const service=seeds.filter(v=>v.catalogType==='food:service');assert.deepEqual(service.map(v=>v.name),SERVICE_RECIPES.map(v=>v.name));assert.equal(service.length,3);assert.ok(service[2].description.includes('不切镜头'));assert.equal(seeds.filter(v=>v.catalogType==='food:environment').length,3);assert.equal(seeds.filter(v=>v.catalogType==='food:avatar-talk').length,1);});
test('只升级原始内置服务定义，历史项目快照和用户副本不变',()=>{const seeds=catalogSeeds([{id:'food',name:'餐饮'}]);const source={id:'catalog:food:service:1',name:'服务介绍',source:'builtin',version:1,versions:[{name:'服务介绍'}]};const copy={...structuredClone(source),id:'user-copy',source:'my'};const snapshot=structuredClone(source);upgradeServiceRecipes([source,copy],seeds);assert.equal(source.name,'商品宣传短片');assert.equal(source.version,2);assert.equal(source.versions[0].name,'服务介绍');assert.equal(snapshot.name,'服务介绍');assert.equal(copy.name,'服务介绍');});
