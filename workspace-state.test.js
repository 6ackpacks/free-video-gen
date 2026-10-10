import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceState } from './workspace-state.js';

test('预设、收藏和隐藏在重启后恢复，删除预设清理对应标记', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-ui-'));
  try {
    const file=path.join(dir,'state.json'),store=new WorkspaceState(file);
    const preset=store.addPreset({name:'30 秒推广',page:'/story',fields:{duration:'30',priorities:'服务流程'},templateIds:['reversal-5']});
    store.update({favorite:['preset:'+preset.id,'video:1','video:1'],hidden:['prompt:1']});
    const restored=new WorkspaceState(file);
    assert.deepEqual(restored.state.favorite,['preset:'+preset.id,'video:1']);
    assert.equal(restored.state.presets[0].fields.duration,'30');
    assert.deepEqual(restored.state.hidden,['prompt:1']);
    restored.removePreset(preset.id);
    assert.equal(restored.state.presets.length,0);
    assert.deepEqual(restored.state.favorite,['video:1']);
    assert.deepEqual(new WorkspaceState(file).state.hidden,['prompt:1']);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('预设不保存凭据，不接受外部页面或嵌套对象，错误标记不改变状态',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-ui-'));
  try {
    const store=new WorkspaceState(path.join(dir,'state.json'));
    for(const fields of [{apiKey:'private'},{token:'private'},{password:'private'},{setting:{nested:1}}])assert.throws(()=>store.addPreset({name:'bad',page:'/story',fields}),/参数无效/);
    assert.throws(()=>store.addPreset({name:'bad',page:'https://outside.test',fields:{}}),/页面无效/);
    store.update({favorite:['video:1']});
    assert.throws(()=>store.update({favorite:['video:2'],hidden:[{}]}),/格式无效/);
    assert.deepEqual(store.state.favorite,['video:1']);
    assert.equal(store.state.presets.length,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
