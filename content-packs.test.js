import test from 'node:test';
import assert from 'node:assert/strict';
import { listContentPacks, validateContentPack } from './content-packs.js';

test('内容模板按顺序登记三个现有场景', () => {
  const packs = listContentPacks();
  assert.deepEqual(packs.map(pack => pack.id), ['foot-spa-store', 'home-massage', 'ktv-business']);
  assert.ok(packs.some(pack => pack.id === 'foot-spa-store' && pack.engine === 'background-variants' && pack.expectedActionCount === 14));
  assert.ok(packs.some(pack => pack.id === 'home-massage' && pack.engine === 'reference-pairs'));
  assert.ok(packs.some(pack => pack.id === 'ktv-business' && pack.engine === 'background-variants' && pack.expectedActionCount === 12));
});

test('内容模板拒绝未知执行引擎和重复场景', () => {
  assert.throws(() => validateContentPack({ schemaVersion: 1, id: 'bad', name: '错误', engine: 'unknown', scenes: [{ id: 'one' }], actions: [{ id: 'x' }] }), /engine/);
  assert.throws(() => validateContentPack({ schemaVersion: 1, id: 'bad', name: '错误', engine: 'reference-pairs', scenes: [{ id: 'one' }, { id: 'one' }], actions: [{ id: 'x' }] }), /scene id/);
});
