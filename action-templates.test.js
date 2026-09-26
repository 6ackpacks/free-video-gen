import test from 'node:test';
import assert from 'node:assert/strict';
import { loadActionTemplates, templatesWithCompatibility } from './action-templates.js';
import { AUDIO_TEXT, QUALITY_TEXT, compilePrompt, makeCharacters, selectTemplate } from './prompt-compiler.js';
import { TrialManager } from './trials.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fullScene = {
  spaceType: '走廊', description: '固定高位视角下的真实走廊，右侧有一扇带刷卡器的近处房门，中央通道连续可行走，左侧可供三人停留。',
  sceneTags: ['corridor', 'visible_door', 'visible_card_door', 'nearby_visible_door', 'clear_walkway', 'side_area'], maxPeople: 3
};

test('loads exactly fourteen stable action templates', () => {
  const templates = loadActionTemplates();
  assert.equal(templates.length, 14);
  assert.deepEqual(templates.map(x => x.id), Array.from({ length: 14 }, (_, i) => `action-${String(i + 1).padStart(2, '0')}`));
  assert.ok(templates.every(x => x.actionText && x.endState && x.sceneTags.length));
});

test('compatibility excludes templates requiring missing real space', () => {
  const templates = templatesWithCompatibility({ description: '窄走廊', sceneTags: ['corridor', 'clear_walkway'], maxPeople: 2 });
  assert.equal(templates.find(x => x.id === 'action-04').compatibility.compatible, true);
  assert.equal(templates.find(x => x.id === 'action-08').compatibility.compatible, false);
  assert.equal(templates.find(x => x.id === 'action-12').compatibility.compatible, false);
});

test('compiler preserves locked action verbatim and fixed quality and audio', () => {
  for (const template of templatesWithCompatibility(fullScene)) {
    const characters = makeCharacters(template, 3);
    const output = compilePrompt({ referenceId: 'base-1', sceneProfile: fullScene, template, characters });
    assert.ok(output.prompt.includes(template.actionText), template.id);
    assert.ok(output.prompt.includes(QUALITY_TEXT));
    assert.ok(output.prompt.includes(AUDIO_TEXT));
    assert.equal(/CCTV/i.test(output.prompt), false);
    assert.equal(output.characters.length, template.people);
  }
});

test('random selection only chooses compatible templates', () => {
  const templates = templatesWithCompatibility({ description: '窄走廊', sceneTags: ['corridor', 'clear_walkway'], maxPeople: 1 });
  for (let i = 0; i < 100; i++) assert.equal(selectTemplate({ templates, mode: 'random' }).compatibility.compatible, true);
});

test('trial planning keeps one locked template per video for Qwen character drafting', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'locked-action-trial-'));
  const queue = {
    provider: { promptModel: 'qwen-test' }, state: { jobs: [] },
    enqueue(planned) { const id = `batch-${this.state.jobs.length}`; this.state.jobs.push(...planned.map(job => ({ ...job, batchId: id, status: 'draft_pending', outputs: [] }))); return { id }; }
  };
  const references = { get: () => ({ id: 'base-1', analysisStatus: 'complete', sceneProfile: fullScene }), ensure: async () => 'https://example.invalid/base.jpg' };
  const manager = new TrialManager(path.join(directory, 'trials.json'), queue, references);
  const result = await manager.create({ count: 5, referenceId: 'base-1', actionMode: 'random', generationMethod: 'apimart' });
  assert.equal(result.count, 5);
  const planned = [queue.state.jobs[0], ...manager.items[0].remaining];
  assert.equal(planned.length, 5);
  for (const job of planned) {
    assert.equal(job.lockedActionTemplate.id, job.actionId);
    assert.equal(job.lockedActionTemplate.actionText.length > 20, true);
    assert.equal(job.prompt, '');
    assert.equal(job.characters.length, 0);
  }
  fs.rmSync(directory, { recursive: true, force: true });
});
