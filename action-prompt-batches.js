import { randomUUID } from 'node:crypto';
import { templatesWithCompatibility } from './action-templates.js';
import { contentPackActionDirectory, getContentPack } from './content-packs.js';
import { selectTemplate } from './prompt-compiler.js';
import { promptInputs } from './prompt-guidance.js';

export async function draftActionPromptBatch(input, provider, references, report = () => {}) {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw Error('提示词数量须为 1–500');
  if (!provider.promptModel) throw Error('请先配置提示词大模型');
  const reference = references.get(input.referenceId);
  if (reference.analysisStatus !== 'complete' || !reference.sceneProfile) throw Error('请先完成底图分析');
  const pack = getContentPack(input.packId || 'foot-spa-store');
  if (pack.engine !== 'background-variants') throw Error('当前模板不支持门店提示词生成');
  const templates = templatesWithCompatibility(reference.sceneProfile, contentPackActionDirectory(pack), { expectedCount: pack.expectedActionCount });
  const jobs = [];
  for (let index = 1; index <= count; index++) {
    const actionTemplate = selectTemplate({ templates, mode: input.actionMode, actionId: input.actionId, recentActionIds: jobs.map(j=>j.actionTemplate.id) });
    jobs.push({ referenceId: reference.id, sceneProfile: reference.sceneProfile, actionTemplate, index, seed: randomUUID(), duration: Math.max(2, Math.min(30, Math.round(Number(input.duration) || 5))), ratio: '9:16', outfitPreferences: input.outfitPreferences || {}, userPrompt: String(input.userPrompt || '').trim().slice(0,3000), ...promptInputs(input) });
  }
  const items = Array(count).fill(null);
  let next = 0, completed = 0;
  async function worker() {
    while (next < jobs.length) {
      const offset = next++, job = jobs[offset], id = randomUUID();
      const previous = items.filter(item=>item?.prompt);
      try {
        const result = await provider.draft({ ...job, recentCharacters: previous.flatMap(item=>item.characters || []).slice(-20), draftAnchor: previous.at(-1)?.prompt || '' });
        items[offset] = { ...result, id, index: offset+1, actionName: job.actionTemplate.name, selected: true };
      } catch (error) { items[offset] = { id, index: offset+1, actionId: job.actionTemplate.id, actionName: job.actionTemplate.name, error: error.message, prompt: '', selected: false }; }
      completed++;
      report({ completed, total: count, partialItems: items.filter(Boolean) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, count) }, worker));
  return { count, items, inputs: input };
}
