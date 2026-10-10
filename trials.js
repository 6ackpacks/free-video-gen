import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { templatesWithCompatibility } from './action-templates.js';
import { selectTemplate } from './prompt-compiler.js';
import { contentPackActionDirectory, getContentPack } from './content-packs.js';
import { actionContextKey, parseActionDraft, promptInputs } from './prompt-guidance.js';

const fixedMassageVariants = [
  '双手轻柔交替揉按顾客足弓，动作小幅连续',
  '一手稳定脚踝，另一手缓慢推按脚背与足底',
  '双手从足跟向前掌做自然有节奏的按摩',
  '拇指轻缓按压足底，其余手指稳定承托脚部'
];

export function buildFixedMassagePrompt(input = {}) {
  const brandText = String(input.brandText || '伊趣舒心').trim().slice(0, 20) || '伊趣舒心';
  const variant = fixedMassageVariants[(Math.max(1, Number(input.variantIndex) || 1) - 1) % fixedMassageVariants.length];
  const userPrompt = String(input.userPrompt || '').trim().slice(0, 3000);
  return [
    '以输入图片作为固定首帧、人物、服装、家庭背景和构图的唯一视觉依据。9:16 竖屏、第一人称顾客视角、单一连续镜头，不切换第三人称。',
    `成年女性上门足浴技师持续为顾客按摩脚，${variant}；观众必须同时看清按摩动作、技师的面部和上半身。`,
    `人物身份和脸部保持不变；左胸工牌上的“${brandText}”保持清晰稳定。服装保持常规圆领或高圆领，完整遮挡胸线，不低胸、不透视、不变成制服。`,
    '保持真实家庭沙发或卧室环境，不新增足浴店、会所、酒店、浴巾、专业足浴椅、第三人物或无关用品。',
    '动作自然轻缓，双手、手指、腿脚结构准确；禁止换人、换装、多手多脚、肢体融合、场景跳变、镜头漂移和文字变形。无对白。',
    userPrompt
  ].filter(Boolean).join('\n');
}

export class TrialManager {
  constructor(file, queue, references) {
    this.file = file; this.queue = queue; this.references = references;
    this.approving = new Set();
    this.submitting = new Map();
    this.items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }
  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  view(item) {
    const initialJobs = this.queue.state.jobs.filter(job => job.batchId === item.trialBatchId);
    const rawTrialJob = initialJobs[0];
    const trialJob = rawTrialJob ? Object.fromEntries(Object.entries(rawTrialJob).filter(([key]) => key !== 'referenceImageUrl')) : null;
    const bulk = item.bulkBatchId ? this.queue.state.jobs.filter(job => job.batchId === item.bulkBatchId) : [];
    const jobs = [...initialJobs, ...bulk].filter(Boolean).sort((a, b) => a.index - b.index).map(job => ({
      id: job.id, index: job.index, status: job.status, outputs: job.outputs, error: job.error || '',
      actionId: job.actionId, actionName: job.actionName, duration: job.duration, endState: job.endState,
      prompt: job.prompt, promptSections: job.promptSections, characters: job.characters
    }));
    return {
      id: item.id, createdAt: item.createdAt, workflow: item.workflow || 'template-actions', packId: item.packId || 'foot-spa-store', skillId: item.skillId, skillName: item.skillName,
      count: item.count, submissionMode: item.submissionMode || 'trial-first', description: item.description, referenceId: item.referenceId, generationMethod: item.generationMethod || 'apimart',
      videoRoute: item.videoRoute || item.generationMethod || 'apimart', videoModel: item.videoModel || '', duration: item.duration, resolution: item.resolution, ratio: item.ratio, userPrompt: item.userPrompt || '',
      actionMode: item.actionMode, actionId: item.actionId, actionName: item.actionName, sceneProfile: item.sceneProfile,
      trialBatchId: item.trialBatchId, trialJob: trialJob || null, bulkBatchId: item.bulkBatchId || null,
      jobs,
      bulk: { total: bulk.length, complete: bulk.filter(x => x.status === 'complete').length, errors: bulk.filter(x => ['error', 'needs_review'].includes(x.status)).length }
    };
  }
  list(summary = false) {
    return this.items.map(item => {
      if (!summary) return this.view(item);
      const jobs = this.queue.state.jobs.filter(job => job.batchId === item.trialBatchId || job.batchId === item.bulkBatchId);
      return { id: item.id, createdAt: item.createdAt, packId: item.packId || 'foot-spa-store', actionName: item.actionName, skillName: item.skillName, actionId: item.actionId, actionMode: item.actionMode, count: item.count, bulkBatchId: item.bulkBatchId, complete: jobs.filter(j => j.status === 'complete').length, errors: jobs.filter(j => ['error','needs_review'].includes(j.status)).length, generated: jobs.length };
    });
  }
  get(id) {
    const item = this.items.find(x => x.id === id);
    if (!item) throw new Error('试片记录不存在');
    return this.view(item);
  }
  async create(input) {
    if (!Array.isArray(input.preparedPrompts) || !input.requestId) return this.createInternal(input);
    if (this.submitting.has(input.requestId)) return this.submitting.get(input.requestId);
    const pending = this.createInternal(input);
    this.submitting.set(input.requestId, pending);
    try { return await pending; } finally { this.submitting.delete(input.requestId); }
  }
  async createInternal(input) {
    if (input.workflow === 'fixed-massage') return this.createFixedMassage(input);
    const direct = Array.isArray(input.preparedPrompts);
    if (direct && input.requestId) { const existing = this.items.find(item => item.requestId === input.requestId); if (existing) return this.view(existing); }
    if (!this.queue.provider?.promptModel) throw new Error('请先配置 Qwen 提示词模型；实际任务的人物外貌与穿搭由大模型生成');
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('生成数量须为 1–500');
    if (direct && (input.preparedPrompts.length !== count || new Set(input.preparedPrompts.map(item => item.id)).size !== count)) throw Error('勾选的提示词数量或条目不正确');
    const description = String(input.description || input.userPrompt || '').trim().slice(0, 3000);
    const referenceId = String(input.referenceId || '');
    if (!referenceId) throw new Error('请先上传并固定一张底图');
    const reference = this.references.get(referenceId);
    if (reference.analysisStatus !== 'complete' || !reference.sceneProfile) throw new Error('请先完成底图场景分析');
    const videoRoute = ['apimart', 'wan-tokendance', 'wan-aliyun', 'doubao'].includes(input.videoRoute) ? input.videoRoute : (input.generationMethod === 'doubao' ? 'doubao' : 'apimart');
    const generationMethod = videoRoute === 'doubao' ? 'doubao' : 'apimart';
    const videoModel = videoRoute.startsWith('wan-') ? 'wan3.0-video' : videoRoute === 'doubao' ? (process.env.DOUBAO_MODEL || 'seedance_v2.0_mini') : (process.env.VIDEO_MODEL || 'grok-imagine-1.5-video-ext');
    const duration = Number(input.duration ?? 5);
    if (!Number.isInteger(duration) || duration < 2 || duration > 15) throw Error('非短剧视频时长须为 2–15 秒');
    const resolution = ['480P', '720P', '1080P'].includes(String(input.resolution || '').toUpperCase()) ? String(input.resolution).toUpperCase() : '480P';
    const ratio = '9:16';
    const actionMode = input.actionMode === 'random' ? 'random' : 'manual';
    const pack = getContentPack(String(input.packId || 'foot-spa-store'));
    if (pack.engine !== 'background-variants') throw new Error('当前内容模板不支持固定底图模式');
    const templates = templatesWithCompatibility(reference.sceneProfile, contentPackActionDirectory(pack), { expectedCount: pack.expectedActionCount });
    const recentActionIds = this.items.filter(item => (item.packId || 'foot-spa-store') === pack.id).slice(0, 20).map(x => x.actionId).filter(Boolean);
    const planned = [];
    for (let i = 1; i <= count; i++) {
      const reviewed = direct ? input.preparedPrompts[i-1] : (i === 1 ? input.preparedPrompt : null);
      const jobDuration = Number(Array.isArray(input.selections) ? reviewed?.duration ?? duration : duration);
      if (!Number.isInteger(jobDuration) || jobDuration < 2 || jobDuration > 15) throw Error('非短剧视频时长须为 2–15 秒');
      const template = selectTemplate({ templates, actionId: reviewed ? reviewed.actionId : input.actionId, mode: reviewed ? 'manual' : actionMode, recentActionIds: [...recentActionIds, ...planned.map(x => x.actionId)] });
      planned.push({
        id: randomUUID(), index: i, packId: pack.id, skillId: `${pack.id}-locked-actions`, skillName: template.name,
        prompt: '', promptSections: null, lockedPrompt: false, actionTemplate: template, promptMode: 'template-skill-v1', ...promptInputs(direct && Array.isArray(input.selections) ? reviewed : input),
        actionId: template.id, actionName: template.name, endState: template.endState,
        sceneProfile: reference.sceneProfile, characters: [], outfitPreferences: input.outfitPreferences || {}, description, userPrompt: description,
        referenceId, generationMethod, videoRoute, videoModel, duration: jobDuration, resolution, ratio, seed: Math.floor(Math.random() * 2147483647)
      });
    }
    if (direct) {
      for (let offset = 0; offset < planned.length; offset++) {
        const reviewed = input.preparedPrompts[offset], job = planned[offset];
        if (actionContextKey(job) !== reviewed.contextKey) throw Error('底图、模板或生成设置已变化，请重新生成提示词');
        const prepared = parseActionDraft(JSON.stringify(reviewed), job);
        Object.assign(job, { prompt: prepared.prompt, characters: prepared.characters, promptSections: prepared.promptSections, lockedPrompt: true, promptSource: prepared.promptSource, promptDraftId: reviewed.id });
      }
    }
    if (input.preparedPrompt) {
      if (actionContextKey(planned[0]) !== input.preparedPrompt.contextKey) throw Error('模板、底图或创作要求已变化，请重新生成提示词');
      const prepared = parseActionDraft(JSON.stringify(input.preparedPrompt), planned[0]);
      Object.assign(planned[0], { prompt: prepared.prompt, characters: prepared.characters, promptSections: prepared.promptSections, lockedPrompt: true, promptSource: prepared.promptSource });
      for (const job of planned.slice(1)) if (job.actionId === planned[0].actionId) job.draftAnchor = prepared.prompt;
    }
    const referenceImageUrl = videoRoute.startsWith('wan-') ? this.references.source(referenceId, 'data-url') : (videoRoute === 'apimart' ? await this.references.ensure(referenceId) : '');
    for (const job of planned) { job.referenceId = referenceId; job.referenceImageUrl = referenceImageUrl; job.generationMethod = generationMethod; }
    if (direct && videoRoute === 'doubao') await this.queue.provider.doubao?.prepareBatch(planned.length);
    const batch = this.queue.enqueue(direct ? planned : [planned[0]]);
    const item = {
      id: randomUUID(), createdAt: new Date().toISOString(), packId: pack.id, skillId: `${pack.id}-locked-actions`, skillName: planned[0].skillName,
      count, description, userPrompt: description, referenceId, generationMethod, videoRoute, videoModel, duration, resolution, ratio, actionMode, actionId: planned[0].actionId,
      actionName: [...new Set(planned.map(job=>job.actionName))].join(' / '), sceneProfile: reference.sceneProfile,
      ...promptInputs(input),
      submissionMode: direct ? 'selected-prompts' : 'trial-first', requestId: input.requestId || '',
      trialBatchId: batch.id, bulkBatchId: direct ? 'none' : '', remaining: direct ? [] : planned.slice(1)
    };
    this.items.unshift(item); this.save();
    return this.view(item);
  }
  async createFixedMassage(input) {
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('生成数量须为 1–500');
    const referenceId = String(input.referenceId || '');
    if (!referenceId) throw new Error('请先选择一张固定按摩首帧');
    this.references.get(referenceId);
    const videoRoute = ['custom', 'apimart', 'wan-tokendance', 'wan-aliyun', 'doubao'].includes(input.videoRoute) ? input.videoRoute : 'apimart';
    const routeInfo = this.queue.provider?.routes?.find(item => item.id === videoRoute);
    const videoModel = routeInfo?.model || '';
    const generationMethod = videoRoute === 'doubao' ? 'doubao' : 'apimart';
    const duration = Number(input.duration ?? 5);
    if (!Number.isInteger(duration) || duration < 2 || duration > 15) throw Error('非短剧视频时长须为 2–15 秒');
    const resolution = ['480P', '720P', '1080P'].includes(String(input.resolution || '').toUpperCase()) ? String(input.resolution).toUpperCase() : '480P';
    const description = String(input.userPrompt || '').trim().slice(0, 3000);
    const referenceImageUrl = videoRoute.startsWith('wan-') || videoRoute === 'custom'
      ? this.references.source(referenceId, 'data-url')
      : (videoRoute === 'apimart' ? await this.references.ensure(referenceId) : '');
    const planned = Array.from({ length: count }, (_, offset) => {
      const index = offset + 1;
      const prompt = buildFixedMassagePrompt({ variantIndex: index, userPrompt: description });
      return {
        id: randomUUID(), index, skillId: 'yiqushuxin-fixed-massage', skillName: '伊趣舒心 · 固定首帧足部按摩',
        prompt, promptSections: { sourceImage: `固定首帧 ${referenceId}`, lockedAction: prompt }, lockedPrompt: true,
        actionId: 'fixed-foot-massage', actionName: '家庭足部按摩', endState: '技师继续自然按摩脚部',
        sceneProfile: null, characters: [], description, userPrompt: description,
        referenceId, referenceImageUrl, generationMethod, videoRoute, videoModel, duration, resolution, ratio: '9:16',
        seed: Math.floor(Math.random() * 2147483647)
      };
    });
    const batch = this.queue.enqueue([planned[0]]);
    const item = {
      id: randomUUID(), createdAt: new Date().toISOString(), workflow: 'fixed-massage',
      skillId: 'yiqushuxin-fixed-massage', skillName: '伊趣舒心 · 固定首帧足部按摩',
      count, description, userPrompt: description, referenceId, generationMethod, videoRoute, videoModel, duration, resolution, ratio: '9:16',
      actionMode: 'fixed', actionId: 'fixed-foot-massage', actionName: '家庭足部按摩', sceneProfile: null,
      trialBatchId: batch.id, bulkBatchId: '', remaining: planned.slice(1)
    };
    this.items.unshift(item); this.save();
    return this.view(item);
  }
  async approve(id) {
    const item = this.items.find(x => x.id === id);
    if (!item) throw new Error('试片记录不存在');
    if (item.bulkBatchId) return this.view(item);
    if (this.approving.has(id)) throw new Error('批量任务正在创建，请稍后刷新');
    const trial = this.queue.state.jobs.find(job => job.batchId === item.trialBatchId);
    if (trial?.status !== 'complete' || !trial.outputs?.length) throw new Error('请等试片完成并预览后再批量生成');
    this.approving.add(id);
    try {
      if (item.referenceId && item.generationMethod !== 'doubao') {
        const referenceImageUrl = item.videoRoute?.startsWith('wan-') || item.videoRoute === 'custom' ? this.references.source(item.referenceId, 'data-url') : await this.references.ensure(item.referenceId);
        for (const job of item.remaining) job.referenceImageUrl = referenceImageUrl;
      }
      if (item.remaining.length) item.bulkBatchId = this.queue.enqueue(item.remaining).id;
      else item.bulkBatchId = 'none';
      item.remaining = []; this.save();
      return this.view(item);
    } finally { this.approving.delete(id); }
  }
}
