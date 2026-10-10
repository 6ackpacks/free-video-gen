import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StoryLibrary, STORY_STRATEGIES } from './story-library.js';

test('宣传知识库支持保存、更新、重载、删除，并为生成保存事实快照', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-library-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'subjects.json');
  const library = new StoryLibrary(file);
  const subject = library.save({ name: '人民金行', materials: '提供咨询服务，不承诺收益' });
  const resolved = library.resolve({ subjectId: subject.id, templateId: 'legacy-surveillance', duration: 24, priorities: '流程' });
  library.save({ name: '新主体', materials: '新资料' }, subject.id);
  assert.equal(resolved.brief, '提供咨询服务，不承诺收益');
  assert.equal(resolved.sceneId, 'surveillance');
  assert.equal(resolved.priorities, '流程');
  const restored = new StoryLibrary(file);
  assert.equal(restored.get(subject.id).name, '新主体');
  assert.equal(STORY_STRATEGIES.filter(s => s.status === 'unsupported').length, 2);
  assert.throws(() => restored.resolve({ subjectId: subject.id, templateId: 'unknown' }), /已接入/);
  restored.delete(subject.id);
  assert.equal(new StoryLibrary(file).list().length, 0);
  assert.throws(() => restored.get(subject.id), /不存在/);
  assert.throws(() => restored.save({ name: 'test', materials: 'x'.repeat(30001) }), /30000/);
});

test('宣传主体参考图片保留用途、限定归属，不自动锁定首帧', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-assets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'subjects.json'), library = new StoryLibrary(file);
  const referenceId = '10000000-0000-0000-0000-000000000001';
  const subject = library.save({ name: '店铺', materials: '提供首饰服务', assets: [{ referenceId, name: '项链.png', role: '项链款式' }] });
  library.save({ name: '店铺', materials: '新资料' }, subject.id);
  const restored = new StoryLibrary(file);
  const base = { subjectId: subject.id, templateIds: ['emotion-family', 'reversal-5'], referenceImageIds: [referenceId] };
  assert.deepEqual(restored.resolve({ ...base, referenceMode: 'text-only' }).referenceImageIds, []);
  const input = restored.resolve({ ...base, referenceMode: 'reference-image' });
  assert.equal(input.selectedAssets[0].role, '项链款式');
  assert.equal(input.templates.length, 2);
  assert.equal(input.referenceMode, 'reference-image');
  assert.throws(() => restored.resolve({ ...base, referenceImageIds: ['unknown'], referenceMode: 'reference-image' }), /不属于/);
  assert.throws(() => restored.resolve({ ...base, referenceImageIds: [], referenceMode: 'reference-image' }), /至少一张/);
});
