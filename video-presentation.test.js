import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VideoPresentation } from './video-presentation.js';
test('示例只选同内容包同动作的成片，手动更换重启保留，失败任务不当示例',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'video-examples-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const jobs=[{id:'new',packId:'foot-spa-store',actionId:'action-02',status:'error',outputs:['x']},{id:'ktv',packId:'ktv-business',actionId:'action-02',status:'complete',outputs:['x']},{id:'one',packId:'foot-spa-store',actionId:'action-02',status:'complete',outputs:['x'],duration:5},{id:'two',packId:'foot-spa-store',actionId:'action-02',status:'complete',outputs:['x']}];
  const store=new VideoPresentation(dir);assert.equal(store.example('foot-spa-store','action-02',jobs).jobId,'one');assert.equal(store.example('foot-spa-store','action-03',jobs),null);
  assert.throws(()=>store.assign('foot-spa-store','action-02','ktv',jobs),/该模板/);assert.throws(()=>store.assign('foot-spa-store','action-02','new',jobs),/该模板/);
  store.assign('foot-spa-store','action-02','two',jobs);assert.equal(new VideoPresentation(dir).example('foot-spa-store','action-02',jobs).jobId,'two');
});
test('本地示例与封面使用受限文件路径，文件格式检查且覆盖示例保留旧文件',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local-examples-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new VideoPresentation(dir);
  assert.throws(()=>store.upload('pack','action',{dataUrl:'data:video/mp4;base64,AAAA'}),/有效 MP4/);
  const bytes=Buffer.alloc(16);bytes.write('ftyp',4);const example=store.upload('pack','action',{name:'示例.mp4',dataUrl:'data:video/mp4;base64,'+bytes.toString('base64')});
  assert.equal(fs.readFileSync(store.local(example.fileId)).toString('hex'),bytes.toString('hex'));assert.equal(store.local('../private'),null);assert.throws(()=>store.poster('../private'),/无效/);
  assert.throws(()=>store.savePoster(example.fileId,'data:image/jpeg;base64,AAAA'),/JPEG/);const jpeg=Buffer.from([255,216,1,2,255,217]);store.savePoster(example.fileId,'data:image/jpeg;base64,'+jpeg.toString('base64'));assert.ok(fs.existsSync(store.poster(example.fileId)));
  assert.equal(new VideoPresentation(dir).example('pack','action',[]).source,'uploaded');
});
