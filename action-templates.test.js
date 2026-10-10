import test from 'node:test';
import assert from 'node:assert/strict';
import { loadActionTemplates, templatesWithCompatibility } from './action-templates.js';
import { AUDIO_TEXT, QUALITY_TEXT, compilePrompt, makeCharacters, selectTemplate } from './prompt-compiler.js';
import { TrialManager } from './trials.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contentPackActionDirectory, getContentPack } from './content-packs.js';

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

test('KTV 内容包装载十二个锁定动作且人物角色完整', () => {
  const pack = getContentPack('ktv-business');
  const templates = loadActionTemplates(contentPackActionDirectory(pack), { expectedCount: 12 });
  assert.equal(templates.length, 12);
  assert.ok(templates.every(item => item.characterProfile === 'ktv-business'));
  assert.ok(templates.every(item => item.roles.length === item.people));
  assert.ok(templates.some(item => item.sceneTags.includes('ktv_private_room')));
  assert.ok(templates.some(item => item.sceneTags.includes('ktv_lobby')));
});

test('compatibility excludes templates requiring missing real space', () => {
  const templates = templatesWithCompatibility({ description: '窄走廊', sceneTags: ['corridor', 'clear_walkway'], maxPeople: 2 });
  assert.equal(templates.find(x => x.id === 'action-04').compatibility.compatible, true);
  assert.equal(templates.find(x => x.id === 'action-08').compatibility.compatible, false);
  assert.equal(templates.find(x => x.id === 'action-12').compatibility.compatible, false);
});

test('房门记录与标签不一致时，普通房门动作仍可选择，刷卡和近门条件不放宽', () => {
  const scene = { sceneTags: ['corridor', 'clear_walkway'], maxPeople: 3, doors: [{ position: '两侧墙面', cardAccess: false, nearby: false }] };
  const templates = templatesWithCompatibility(scene);
  for (const id of ['action-01', 'action-03', 'action-06', 'action-08', 'action-14']) {
    const template = templates.find(x => x.id === id);
    assert.equal(template.compatibility.compatible, true, id);
    assert.doesNotThrow(() => compilePrompt({ referenceId: 'base', sceneProfile: scene, template, characters: makeCharacters(template, 1) }));
  }
  for (const id of ['action-07', 'action-09', 'action-10', 'action-12']) assert.equal(templates.find(x => x.id === id).compatibility.compatible, false, id);
});

test('没有房门、疑似房门及明确不可见的房门不能解锁动作', () => {
  for (const doors of [[], [{}], [{ position: '疑似包厢入口' }], [{ position: '左侧', visible: false }], [{ position: '右侧', confirmed: false }]]) {
    const template = templatesWithCompatibility({ sceneTags: ['corridor', 'clear_walkway'], maxPeople: 3, doors }).find(x => x.id === 'action-01');
    assert.equal(template.compatibility.compatible, false);
  }
});

test('明确刷卡房门可解锁刷卡动作，近处房门仍需连续路线，人数限制保持有效', () => {
  const scene = { sceneTags: ['corridor', 'clear_walkway'], maxPeople: 2, doors: [{ position: '右侧近处', cardAccess: true, nearby: true }] };
  assert.equal(templatesWithCompatibility(scene).find(x => x.id === 'action-10').compatibility.compatible, true);
  assert.equal(templatesWithCompatibility({ ...scene, sceneTags: ['corridor'] }).find(x => x.id === 'action-09').compatibility.compatible, false);
  assert.equal(templatesWithCompatibility({ ...scene, maxPeople: 1 }).find(x => x.id === 'action-08').compatibility.compatible, false);
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

test('trial planning passes action constraints to the model for complete prompt drafting', async () => {
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
    assert.equal(job.actionTemplate.id, job.actionId);
    assert.equal(job.actionTemplate.actionText.length > 20, true);
    assert.equal(job.prompt, '');
    assert.equal(job.characters.length, 0);
  }
  fs.rmSync(directory, { recursive: true, force: true });
});
