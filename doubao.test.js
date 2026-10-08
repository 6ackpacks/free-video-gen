import test from 'node:test';
import assert from 'node:assert/strict';
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
  await assert.rejects(() => bridge.submit({ prompt: '测试', duration: 7 }), /仅支持 5 秒或 10 秒/);
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
