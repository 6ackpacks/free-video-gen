import test from 'node:test';
import assert from 'node:assert/strict';
import { createWanProvider, normalizeDuration, normalizeResolution } from './wan.js';
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
