import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listSkills, planBatch } from './skills.js';
import { VIDEO_PROMPT_FRAME, draftMessages, cleanDraft } from './prompt-framework.js';

test('each planned Qwen request keeps the fixed CCTV couple requirements', () => {
  const skill = listSkills().find(item => item.id === 'dc87c7fe-2803-46d3-a0b3-43e1409cfec9');
  assert.equal(skill.name, '老旧监控·会所暧昧互动');
  const jobs = planBatch({ basePrompt: '自然、连贯的视频', skillIds: [skill.id], countPerSkill: 4, variantKey: 'test' });
  assert.equal(jobs.length, 4);
  for (const job of jobs) {
    const messages = draftMessages(job, skill);
    assert.equal(messages[0].role, 'system');
    for (const phrase of ['老旧 CCTV', '足浴', '始终共同活动', '进入房间只是可选剧情']) {
      assert.ok(VIDEO_PROMPT_FRAME.includes(phrase));
      assert.ok(messages[0].content.includes(phrase));
    }
    assert.ok(messages[1].content.includes(job.prompt));
    assert.ok(job.prompt.includes('服装：'));
    assert.ok(job.prompt.includes('动作：'));
    assert.doesNotMatch(job.prompt, /1206|至少两次/);
  }
});

test('Qwen output is sent as one concise positive prompt', () => {
  const result = cleanDraft('## Full English Prompt: A fixed CCTV camera sees two adults enter a room.\n\nNegative Prompt: cinematic, vocals');
  assert.equal(result, 'A fixed CCTV camera sees two adults enter a room.');
  assert.throws(() => cleanDraft(''), /未返回提示词/);
});
