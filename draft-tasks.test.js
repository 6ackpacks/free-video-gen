import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DraftTasks } from './draft-tasks.js';

test('后台提示词任务去重且完成结果可在重启后恢复', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-task-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tasks.json');
  let finish, calls = 0;
  const tasks = new DraftTasks(file, () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const task = tasks.create({ requestId: 'request-1' });
  assert.equal(tasks.create({ requestId: 'request-1' }).id, task.id);
  await new Promise(resolve => setImmediate(resolve));
  finish({ items: [{ imagePrompt: '草稿' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(new DraftTasks(file, null).get(task.id).result.items[0].imagePrompt, '草稿');
});

test('重启将中断的提示词任务明确标为失败', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-restart-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'interrupted', status: 'running' }]));
  assert.equal(new DraftTasks(file, null).get('interrupted').status, 'error');
});
