import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ReferenceLibrary } from './references.js';

test('仓库保留原图与加工图，跨用途选作底图不改变原资料归属且重复选用不重复复制', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-warehouse-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const library = new ReferenceLibrary(directory, null);
  const original = library.add({ name: '商品原图', mime: 'image/png', base64: Buffer.from('original').toString('base64'), purpose: 'story-product' });
  const processed = library.add({ name: '用户加工图', mime: 'image/png', base64: Buffer.from('processed').toString('base64'), assetKind: 'processed' });
  const background = library.useAsBackground(original.id);
  assert.notEqual(background.id, original.id);
  assert.equal(library.get(original.id).purpose, 'story-product');
  assert.equal(library.get(processed.id).assetKind, 'processed');
  assert.equal(library.useAsBackground(original.id).id, background.id);
  assert.equal(library.list().length, 3);
  const reloaded = new ReferenceLibrary(directory, null);
  assert.equal(reloaded.get(processed.id).assetKind, 'processed');
  assert.equal(fs.readFileSync(reloaded.fileFor(background.id).filename, 'utf8'), 'original');
});

test('旧场景档案读出和新档案保存时使用一致的房门证据', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-evidence-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const library = new ReferenceLibrary(directory, null);
  const profile = { description: '真实走廊', sceneTags: ['corridor', 'clear_walkway'], maxPeople: 3, doors: [{ position: '两侧墙面', cardAccess: false, nearby: false }] };
  assert.ok(library.public({ id: 'old', sceneProfile: profile }).sceneProfile.sceneTags.includes('visible_door'));
  assert.equal(profile.sceneTags.includes('visible_door'), false);
  assert.ok(library.normalizeProfile(profile).sceneTags.includes('visible_door'));
  const hidden = library.normalizeProfile({ ...profile, doors: [{ position: '左侧', visible: false, cardAccess: true, nearby: true }] });
  assert.equal(hidden.sceneTags.includes('visible_door'), false);
  assert.equal(hidden.doors[0].visible, false);
});

test('底图分析重启恢复、超时退出且重复提交只调用一次模型', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-analysis-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let calls = 0;
  const provider = { uploadImage: async () => 'https://example.com/image', analyzeScene: () => { calls++; return new Promise(() => {}); } };
  const library = new ReferenceLibrary(directory, provider, { analysisTimeoutMs: 20 });
  const ref = library.addBuffer({ name: 'store', mime: 'image/png', bytes: Buffer.from('image'), purpose: 'store-background' });
  const first = library.analyze(ref.id), second = library.analyze(ref.id);
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every(r => r.status === 'rejected' && /超时/.test(r.reason.message)));
  assert.equal(calls, 1);
  assert.equal(library.get(ref.id).analysisStatus, 'error');
  library.items[0].analysisStatus = 'analyzing'; library.save();
  const restarted = new ReferenceLibrary(directory, provider);
  assert.equal(restarted.get(ref.id).analysisStatus, 'error');
  assert.match(restarted.get(ref.id).analysisError, /中断/);
});

test('足浴店底图库只列出用户上传和监控加工底图', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-library-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const library = new ReferenceLibrary(directory, null);
  const uploaded = library.add({ name: '门店走廊.png', mime: 'image/png', purpose: 'store-background', base64: Buffer.from('store').toString('base64') });
  const generated = library.addBuffer({ name: '伊趣舒心首帧 1-1', mime: 'image/png', bytes: Buffer.from('paired'), purpose: 'paired-keyframe' });
  assert.deepEqual(library.list('store-background').map(item => item.id), [uploaded.id]);
  assert.deepEqual(library.list('paired-keyframe').map(item => item.id), [generated.id]);
});

test('旧家庭按摩首帧会自动归入独立图库且底图可删除', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-migration-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, 'reference-images');
  fs.mkdirSync(assets, { recursive: true });
  const id = '11111111-1111-4111-8111-111111111111';
  fs.writeFileSync(path.join(assets, `${id}.png`), Buffer.from('old'));
  fs.writeFileSync(path.join(directory, 'references.json'), JSON.stringify([{ id, name: '伊趣舒心首帧 2-1', mime: 'image/png', bytes: 3, createdAt: new Date().toISOString() }]));
  const library = new ReferenceLibrary(directory, null);
  assert.equal(library.list('store-background').length, 0);
  assert.equal(library.list('paired-keyframe').length, 1);
  library.remove(id);
  assert.equal(fs.existsSync(path.join(assets, `${id}.png`)), false);
  assert.throws(() => library.get(id), /参考图不存在/);
});
