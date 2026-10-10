import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DoubaoBridge } from './doubao.js';

test('Doubao submission writes selected duration into prompt and payload', async () => {
  const bridge = new DoubaoBridge();
  bridge.info = async () => ({ ready: true });
  let request;
  bridge.request = async (route, options) => {
    request = { route, body: JSON.parse(options.body) };
    return { id: 'doubao-task-1' };
  };

  const result = await bridge.submit({ prompt: '人物一起走入房间。', duration: 10, resolution: '480P', ratio: '9:16' });
  assert.equal(result.id, 'doubao-task-1');
  assert.equal(request.route, '/api/video-tasks');
  assert.match(request.body.prompt, /^视频总时长明确为 10 秒。/);
  assert.equal(request.body.duration, 10);
  assert.equal('resolution' in request.body, false);
});

test('Doubao submission rejects durations unsupported by DoubaoManager', async () => {
  const bridge = new DoubaoBridge();
  bridge.info = async () => ({ ready: true });
  await assert.rejects(() => bridge.submit({ prompt: '测试', duration: 7 }), /仅支持 5 秒、10 秒或 15 秒/);
});

test('Doubao account and scheduler methods use the manager API', async () => {
  const bridge = new DoubaoBridge();
  const calls = [];
  bridge.request = async (route, options = {}) => { calls.push([route, options.method || 'GET', options.body]); return { ok: true }; };
  await bridge.startLogin();
  await bridge.updateAccount('account-1', { enabled: false });
  await bridge.updateSettings({ max_concurrency: 4, daily_quota: 5 });
  assert.deepEqual(calls, [
    ['/api/accounts/login-attempts', 'POST', undefined],
    ['/api/accounts/account-1', 'PATCH', JSON.stringify({ enabled: false })],
    ['/api/settings', 'PUT', JSON.stringify({ max_concurrency: 4, daily_quota: 5 })]
  ]);
});

test('Doubao imports an Electron session into the manager', async () => {
  const bridge = new DoubaoBridge();
  let call;
  bridge.request = async (route, options = {}) => { call = [route, options.method, JSON.parse(options.body)]; return { id: 'manager-1' }; };
  const payload = { identity: { user_id: 'doubao-user' }, cookies: [{ name: 'sessionid', value: 'secret' }] };
  const result = await bridge.importSession(payload);
  assert.equal(result.id, 'manager-1');
  assert.deepEqual(call, ['/api/accounts/import-session', 'POST', payload]);
});

test('Doubao batch concurrency follows task count and usable account count', async () => {
  const bridge = new DoubaoBridge();
  bridge.accounts = async () => Array.from({ length: 20 }, (_, index) => ({ id: String(index), enabled: true, status: 'active', video_quota_used: 0 }));
  bridge.settings = async () => ({ max_concurrency: 1, daily_quota: 5 });
  let changes;
  bridge.updateSettings = async input => { changes = input; };
  const prepared = await bridge.prepareBatch(10);
  assert.deepEqual(prepared, { concurrency: 10, usableAccounts: 20 });
  assert.deepEqual(changes, { max_concurrency: 10 });
});

test('concurrent status checks share one manager task snapshot', async () => {
  const bridge = new DoubaoBridge();
  let requests = 0;
  bridge.request = async () => { requests++; return [{ id: 'one', status: 'succeeded', result_url: 'https://example.test/one.mp4' }, { id: 'two', status: 'generating' }]; };
  const [one, two] = await Promise.all([bridge.status('one'), bridge.status('two')]);
  assert.equal(requests, 1);
  assert.equal(one.status, 'complete');
  assert.equal(two.status, 'running');
});

test('豆包任务回传执行账号、进度和取消原因', async () => {
  const bridge = new DoubaoBridge();
  bridge.request = async () => [{ id: 'one', status: 'starting', account_id: 'account-1', account_name: '账号一', error: '正在上传图片' }, { id: 'two', status: 'cancelled', error: '任务中断' }];
  const one = await bridge.status('one');
  assert.equal(one.progress.accountName, '账号一');
  assert.equal(one.progress.message, '正在上传图片');
  const two = await bridge.status('two');
  assert.equal(two.status, 'error');
  assert.equal(two.error, '任务中断');
});


test('豆包短剧把多张选中的参考图作为真实图片附件提交并去重',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-images-'));
 try{
  const files=['first.jpg','second.png'];files.forEach((file,index)=>fs.writeFileSync(path.join(dir,file),Buffer.from([index+1,2,3])));
  const bridge=new DoubaoBridge();bridge.info=async()=>({ready:true});
  bridge.setReferences({fileFor:id=>({item:{name:files[Number(id)]},filename:path.join(dir,files[Number(id)])})});
  let payload;bridge.request=async(route,options)=>{payload=JSON.parse(options.body);return{id:'test-task'}};
  await bridge.submit({duration:15,prompt:'商品演示',referenceMode:'reference-image',referenceImageIds:['0','1'],referenceId:'0'});
  assert.equal(payload.duration,15);assert.equal(payload.mode,'i2v');assert.equal(payload.images.length,2);
  assert.equal(payload.images[0].data_base64,Buffer.from([1,2,3]).toString('base64'));
  assert.equal(payload.images[1].name,'second.png');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
