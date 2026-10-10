import test from 'node:test';
import assert from 'node:assert/strict';
import { createWanProvider, normalizeDuration, normalizeResolution, normalizeSeed, shouldGenerateAudio } from './wan.js';
import { IMAGE_PROMPT, ImageTransformManager } from './image-transforms.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Wan3 route submits first-frame jobs with simple user parameters', async () => {
  process.env.TESTWAN_API_KEY = 'test-only';
  const calls = [];
  const provider = createWanProvider({ id: 'test', name: 'Wan Test', keyPrefix: 'TESTWAN', submitUrl: 'https://example.test/video-synthesis', tasksBaseUrl: 'https://example.test/tasks', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.includes('/tasks/') ? { output: { task_id: 'task-1', task_status: 'SUCCEEDED', video_url: 'https://example.test/video.mp4' } } : { output: { task_id: 'task-1', task_status: 'PENDING' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  const submitted = await provider.submit({ prompt: '测试提示词', referenceImageUrl: 'data:image/png;base64,AA==', resolution: '480p', duration: 7, ratio: '9:16', seed: 10 });
  assert.equal(submitted.id, 'task-1');
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.model, 'wan3.0-video');
  assert.deepEqual(payload.input.media, [{ type: 'first_frame', url: 'data:image/png;base64,AA==' }]);
  assert.equal(payload.parameters.resolution, '480P');
  assert.equal(payload.parameters.ratio, 'adaptive');
  assert.equal(payload.parameters.duration, 7);
  assert.equal(payload.parameters.audio, false);
  assert.equal(payload.parameters.prompt_extend, false);
  await provider.submit({ prompt: '参考图自由生成', referenceImageUrl: 'data:image/png;base64,BB==', referenceMode: 'reference-image', resolution: '720P', duration: 5, ratio: '9:16', seed: 11 });
  const referencePayload = JSON.parse(calls[1].options.body);
  assert.deepEqual(referencePayload.input.media, [{ type: 'reference_image', url: 'data:image/png;base64,BB==' }]);
  assert.equal(referencePayload.parameters.ratio, '9:16');
  await provider.submit({ prompt: '配上优雅暧昧的音乐', referenceImageUrl: 'data:image/png;base64,CC==', referenceMode: 'reference-image', seed: 12 });
  const audioPayload = JSON.parse(calls[2].options.body);
  assert.equal(audioPayload.parameters.audio, true);
  await provider.submit({ prompt: '项链手镯外观参考，中文对白与背景音乐', referenceImageUrls: ['https://example.test/necklace.png', 'https://example.test/bracelet.png'], referenceMode: 'reference-image', duration: 30, ratio: '9:16' });
  const multiPayload = JSON.parse(calls[3].options.body);
  assert.deepEqual(multiPayload.input.media, [{ type: 'reference_image', url: 'https://example.test/necklace.png' }, { type: 'reference_image', url: 'https://example.test/bracelet.png' }]);
  assert.equal(multiPayload.parameters.duration, 30);
  assert.equal(multiPayload.parameters.ratio, '9:16');
  const status = await provider.status('task-1');
  assert.equal(status.status, 'complete');
  assert.equal(status.outputs[0].url, 'https://example.test/video.mp4');
  delete process.env.TESTWAN_API_KEY;
});

test('Wan3 parameters are bounded and default to 480P', () => {
  assert.equal(normalizeResolution('bad'), '480P');
  assert.equal(normalizeResolution('1080p'), '1080P');
  assert.equal(normalizeDuration(1), 2);
  assert.equal(normalizeDuration(40), 30);
  assert.equal(normalizeSeed(3313443660), 1165960012);
  assert.equal(normalizeSeed(-1), -1);
  assert.equal(normalizeSeed(-2), -1);
  assert.equal(shouldGenerateAudio('配上优雅暧昧的音乐'), true);
  assert.equal(shouldGenerateAudio('无对白'), false);
});

test('camera image tasks receive different timestamps and fixed edit instructions', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'image-transform-'));
  fs.mkdirSync(directory, { recursive: true });
  let n = 0;
  const provider = { submitImageTransform: async (_url, prompt) => ({ id: `p-${++n}`, prompt }) };
  const references = { ensure: async () => 'https://example.test/input.jpg' };
  const manager = new ImageTransformManager(directory, provider, references);
  const a = await manager.create('ref-1'); const b = await manager.create('ref-1');
  assert.notEqual(a.timestamp, b.timestamp);
  assert.match(a.prompt, /45 度/);
  assert.match(a.prompt, /严格保留原图/);
  assert.match(IMAGE_PROMPT('2026年9月9日 PM 10:24'), /通道01/);
  fs.rmSync(directory, { recursive: true, force: true });
});
