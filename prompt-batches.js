import { promptInputs } from './prompt-guidance.js';
import { FEMALE_WARDROBE_RULES } from './wardrobe-rules.js';
import { planPromptPairs, hasForbiddenAppearance } from './paired-prompts.js';

const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
export function hasOutOfRangeFemaleAge(value) {
  const text = String(value || '');
  if (/(?:中年|老年|熟妇|四十多|五十多|六十多)/.test(text)) return true;
  return [...text.matchAll(/(\d{2})\s*岁/g)].some(match => Number(match[1]) < 22 || Number(match[1]) > 32);
}
export async function draftKeyframePromptBatch(input, provider) {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('单次提示词批次须为 1–100 条');
  if (!provider?.draftKeyframePrompts) throw new Error('尚未配置提示词大模型');
  const base = planPromptPairs({ ...input, count });
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const drafted = await provider.draftKeyframePrompts({
      count, sceneMode: input.sceneMode || 'mixed', focusMode: input.focusMode || 'mixed', footMode: input.footMode || 'mixed',
      userDirection: clean(input.imagePrompt, 2000), ...promptInputs(input),
      requiredFields: ['appearance', 'clothing'],
      retryInstruction: attempt > 1 ? `上一批人物描述未通过检查。本次必须写明 22–32 岁，人物外貌明显不同。${FEMALE_WARDROBE_RULES}` : ''
    });
    try {
      if (!Array.isArray(drafted?.items) || drafted.items.length !== count) throw new Error(`提示词大模型必须返回 ${count} 组人物描述`);
      const seen = new Set();
      const items = drafted.items.map((value, offset) => {
        const appearance = clean(value?.appearance, 300), clothing = clean(value?.clothing, 300);
        if (!appearance || !clothing) throw new Error(`第 ${offset + 1} 组缺少人物形象或穿着`);
        if (hasOutOfRangeFemaleAge(appearance)) throw new Error(`第 ${offset + 1} 组人物年龄不在 22–32 岁`);
        if (hasForbiddenAppearance(`${appearance} ${clothing}`)) throw new Error(`第 ${offset + 1} 组违反服装覆盖约束`);
        const signature = clean(appearance, 300).toLowerCase().replace(/\s+/g, '');
        if (seen.has(signature)) throw new Error(`第 ${offset + 1} 组人物与前文重复`);
        seen.add(signature);
        const scaffold = base[offset];
        const imagePrompt = scaffold.imagePrompt.replace(scaffold.variation.appearance, appearance).replace(scaffold.variation.clothing, clothing);
        return { ...scaffold, identityKey: signature, variation: { ...scaffold.variation, appearance, clothing, promptSource: 'llm' }, imagePrompt };
      });
      const guidance = promptInputs(input);
      if (guidance.creativeBrief || guidance.outputRequirements || guidance.outputLanguage !== 'auto') {
        if (!provider.rewritePrompts) throw Error('当前模型不支持完整提示词改写');
        for (let offset = 0; offset < items.length; offset += 15) {
          const slice = items.slice(offset, offset + 15);
          let rewritten;
          try { rewritten = await provider.rewritePrompts({ mode: 'paired', ...guidance, context: { template: '家庭上门足部按摩', brand: input.brandText || '伊趣舒心' }, items: slice.flatMap(item => [{ id: item.id + ':image', prompt: item.imagePrompt }, { id: item.id + ':video', prompt: item.videoPrompt }]) }); }
          catch (error) { error.promptRewriteFailure = true; throw error; }
          const texts = new Map(rewritten.items.map(item => [item.id, item.prompt]));
          for (const item of slice) {
            if (!texts.get(item.id + ':image') || !texts.get(item.id + ':video')) throw Error('模型未返回对应的图片与视频提示词');
            item.imagePrompt = texts.get(item.id + ':image'); item.videoPrompt = texts.get(item.id + ':video');
          }
        }
      }
      return { source: 'llm', count, items, attempts: attempt };
    } catch (error) { if (error.promptRewriteFailure) throw error; lastError = error; }
  }
  throw new Error(`提示词连续 4 次未通过安全与去重检查：${lastError?.message || '未知错误'}`);
}

export function validateReviewedPromptItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('审核后的提示词须为 1–100 条');
  const identities = new Set();
  return items.map((item, offset) => {
    const identityKey = clean(item.identityKey, 800);
    const imagePrompt = clean(item.imagePrompt, 10000);
    const videoPrompt = clean(item.videoPrompt, 6000);
    if (!identityKey || identities.has(identityKey)) throw new Error(`第 ${offset + 1} 条人物身份重复或缺失`);
    identities.add(identityKey);
    if (!imagePrompt || !videoPrompt) throw new Error(`第 ${offset + 1} 条提示词不完整`);
    return { ...item, imagePrompt, videoPrompt, identityKey };
  });
}
