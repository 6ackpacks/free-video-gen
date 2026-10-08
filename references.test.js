import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ReferenceLibrary } from './references.js';

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
