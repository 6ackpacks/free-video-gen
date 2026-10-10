import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VideoQueue } from './queue.js';

test('批次只提交首条试片，待确认任务重启后保留，失败试片不能放行且重复确认不重复提交', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-review-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'queue.json');
  const queue = new VideoQueue(file, {}); queue.pump = () => {}; clearInterval(queue.timer);
  const batch = queue.enqueue([1,2,3].map(index => ({ id: `job-${index}`, index, prompt: '已审核提示词', lockedPrompt: true })), { reviewFirst: true });
  assert.equal(queue.state.jobs.filter(j => j.status === 'queued').length, 1);
  assert.equal(queue.review(batch.id).remaining, 2);
  assert.throws(() => queue.approveReview(batch.id), /等待试片/);
  const restarted = new VideoQueue(file, {}); restarted.pump = () => {}; clearInterval(restarted.timer);
  assert.equal(restarted.review(batch.id).remaining, 2);
  const first = restarted.state.jobs.find(j => j.id === 'job-1'); first.status = 'error';
  assert.throws(() => restarted.approveReview(batch.id), /等待试片/);
  first.status = 'complete'; first.outputs = ['https://example.test/video.mp4'];
  assert.equal(restarted.approveReview(batch.id).remaining, 0);
  assert.equal(restarted.approveReview(batch.id).approved, true);
  assert.equal(restarted.state.jobs.length, 3);
  assert.equal(restarted.state.jobs.filter(j => j.status === 'queued').length, 2);
});
