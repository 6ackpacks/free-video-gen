import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { test } from 'node:test';
import { MediaStore } from './media.js';

test('异步试览准备显示状态、复用同一下载，失败可重试', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-cache-status-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new MediaStore(directory, { maxKbps: 8192 });
  const job = { id: 'cache-status', outputs: ['https://example.test/video.mp4'] };
  let calls = 0;
  store.direct = async () => { calls++; throw Error('网络中断'); };
  assert.equal(store.prepare(job).running, true);
  store.prepare(job);
  await Promise.allSettled([...store.saves.values()]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.match(store.cacheStatus(job).error, /网络中断/);
  store.direct = async () => { calls++; const remote = Readable.from([Buffer.from('video')]); remote.statusCode = 200; remote.headers = { 'content-length': '5' }; return remote; };
  store.prepare(job);
  await Promise.allSettled([...store.saves.values()]);
  assert.equal(store.cacheStatus(job).ready, true);
  assert.equal(store.cacheStatus(job).bytes, 5);
  assert.equal(store.cacheStatus(job).error, '');
  assert.equal(calls, 2);
});

test('preview and batch saves share a single limited transfer', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-media-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new MediaStore(directory, { maxKbps: 128 });
  let active = 0;
  let peak = 0;
  let requests = 0;
  const saveOne = store.saveOne.bind(store);
  store.saveOne = async job => {
    active++;
    peak = Math.max(peak, active);
    try { return await saveOne(job); }
    finally { active--; }
  };
  store.direct = async () => {
    requests++;
    const remote = Readable.from([Buffer.alloc(16 * 1024), Buffer.alloc(16 * 1024)]);
    remote.statusCode = 200;
    remote.headers = { 'content-length': String(32 * 1024) };
    return remote;
  };
  const one = { id: 'one', outputs: ['https://example.test/one.mp4'] };
  const two = { id: 'two', outputs: ['https://example.test/two.mp4'] };
  const started = Date.now();
  await Promise.all([store.save(one), store.save(one), store.save(two)]);
  assert.equal(requests, 2);
  assert.equal(peak, 1);
  assert.ok(Date.now() - started >= 400, 'two 32 KB files should take about 500 ms at 128 KB/s');
  assert.equal(fs.statSync(store.filename(one)).size, 32 * 1024);
  assert.equal(fs.statSync(store.filename(two)).size, 32 * 1024);
});

test('first preview is served from a completed local cache', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-preview-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new MediaStore(directory, { maxKbps: 8192 });
  const bytes = Buffer.from('video-data');
  let requests = 0;
  store.direct = async () => {
    requests++;
    const remote = Readable.from([bytes]);
    remote.statusCode = 200;
    remote.headers = { 'content-length': String(bytes.length) };
    return remote;
  };
  const job = { id: 'preview', outputs: ['https://example.test/video.mp4'] };
  const res = new PassThrough();
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.writeHead = status => { res.statusCode = status; };
  const ended = once(res, 'end');
  await store.serve(job, { headers: {} }, res);
  await ended;
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Buffer.concat(chunks), bytes);
  assert.equal(requests, 1);
  assert.deepEqual(fs.readFileSync(store.filename(job)), bytes);

  const download = new PassThrough();
  const headers = {};
  download.on('data', () => {});
  download.writeHead = (status, value) => { download.statusCode = status; Object.assign(headers, value); };
  const downloadEnded = once(download, 'end');
  await store.serve(job, { headers: {} }, download, true);
  await downloadEnded;
  assert.equal(download.statusCode, 200);
  assert.match(headers['Content-Disposition'], /^attachment; filename="video-preview\.mp4"$/);
});

test('batch archive is a downloadable zip with a safe custom filename', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-archive-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new MediaStore(directory, { maxKbps: 8192 });
  const jobs = [{ id: 'one' }, { id: 'two' }];
  fs.writeFileSync(store.filename(jobs[0]), Buffer.from('video-one'));
  fs.writeFileSync(store.filename(jobs[1]), Buffer.from('video-two'));
  const res = new PassThrough();
  const chunks = []; const headers = {};
  res.on('data', chunk => chunks.push(chunk));
  res.writeHead = (status, value) => { res.statusCode = status; Object.assign(headers, value); };
  const ended = once(res, 'end');
  await store.archive(jobs, res, 'videos-batch_01.zip');
  await ended;
  const bytes = Buffer.concat(chunks);
  assert.equal(res.statusCode, 200);
  assert.equal(headers['Content-Type'], 'application/zip');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="videos-batch_01.zip"');
  assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304');
});
