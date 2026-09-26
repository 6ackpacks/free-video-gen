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

  const result = await bridge.submit({ prompt: '人物一起走入房间。', duration: 7, resolution: '480P', ratio: '9:16' });
  assert.equal(result.id, 'doubao-task-1');
  assert.equal(request.route, '/api/video-tasks');
  assert.match(request.body.prompt, /^视频总时长明确为 7 秒。/);
  assert.equal(request.body.duration, 7);
  assert.equal(request.body.resolution, '480p');
});
