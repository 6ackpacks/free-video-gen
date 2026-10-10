import { randomUUID } from 'node:crypto';
import { templatesWithCompatibility } from './action-templates.js';
import { contentPackActionDirectory, getContentPack } from './content-packs.js';
import { selectTemplate } from './prompt-compiler.js';
import { promptInputs } from './prompt-guidance.js';

export async function draftActionPromptBatch(input, provider, references, report = () => {}) {
  const selections = Array.isArray(input.selections) ? input.selections : [input];
  const count = selections.reduce((sum, setting) => sum + Number(setting.count), 0);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw Error('提示词数量须为 1–500');
  for (const setting of selections) {
    if (!Number.isInteger(Number(setting.count)) || Number(setting.count) < 1) throw Error('每个模板数量须为正整数');
    if (!Number.isInteger(Number(setting.duration ?? 5)) || Number(setting.duration ?? 5) < 2 || Number(setting.duration ?? 5) > 15) throw Error('非短剧视频时长须为 2–15 秒');
  }
  if (!provider.promptModel) throw Error('请先配置提示词大模型');
  const reference = references.get(input.referenceId);
  if (reference.analysisStatus !== 'complete' || !reference.sceneProfile) throw Error('请先完成底图分析');
  const pack = getContentPack(input.packId || 'foot-spa-store');
  if (pack.engine !== 'background-variants') throw Error('当前模板不支持门店提示词生成');
  const templates = templatesWithCompatibility(reference.sceneProfile, contentPackActionDirectory(pack), { expectedCount: pack.expectedActionCount });
  const jobs = [];
  for (const setting of selections) for (let n = 0; n < Number(setting.count); n++) {
    const effective = { ...input, ...setting };
    const actionTemplate = selectTemplate({ templates, mode: effective.actionMode, actionId: effective.actionId, recentActionIds: jobs.map(j=>j.actionTemplate.id) });
    jobs.push({ referenceId: reference.id, sceneProfile: reference.sceneProfile, actionTemplate, index: jobs.length+1, seed: randomUUID(), duration: Number(effective.duration ?? 5), ratio: '9:16', outfitPreferences: input.outfitPreferences || {}, userPrompt: String(input.userPrompt || '').trim().slice(0,3000), ...promptInputs(effective) });
  }
  const items = Array(count).fill(null);
  let next = 0, completed = 0;
  async function worker() {
    while (next < jobs.length) {
      const offset = next++, job = jobs[offset], id = randomUUID();
      const previous = items.filter(item=>item?.prompt);
      try {
        const result = await provider.draft({ ...job, recentCharacters: previous.flatMap(item=>item.characters || []).slice(-20), draftAnchor: previous.at(-1)?.prompt || '' });
        items[offset] = { ...result, id, index: offset+1, actionId: job.actionTemplate.id, actionName: job.actionTemplate.name, duration: job.duration, ...promptInputs(job), selected: true };
      } catch (error) { items[offset] = { id, index: offset+1, actionId: job.actionTemplate.id, actionName: job.actionTemplate.name, error: error.message, prompt: '', selected: false }; }
      completed++;
      report({ completed, total: count, partialItems: items.filter(Boolean) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, count) }, worker));
  return { count, items, inputs: input };
}
