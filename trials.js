import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { templatesWithCompatibility } from './action-templates.js';
import { selectTemplate } from './prompt-compiler.js';

export class TrialManager {
  constructor(file, queue, references) {
    this.file = file; this.queue = queue; this.references = references;
    this.approving = new Set();
    this.items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }
  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  view(item) {
    const trialJob = this.queue.state.jobs.find(job => job.batchId === item.trialBatchId);
    const bulk = item.bulkBatchId ? this.queue.state.jobs.filter(job => job.batchId === item.bulkBatchId) : [];
    const jobs = [trialJob, ...bulk].filter(Boolean).sort((a, b) => a.index - b.index).map(job => ({
      id: job.id, index: job.index, status: job.status, outputs: job.outputs, error: job.error || '',
      actionId: job.actionId, actionName: job.actionName, endState: job.endState,
      prompt: job.prompt, promptSections: job.promptSections, characters: job.characters
    }));
    return {
      id: item.id, createdAt: item.createdAt, skillId: item.skillId, skillName: item.skillName,
      count: item.count, description: item.description, referenceId: item.referenceId, generationMethod: item.generationMethod || 'apimart',
      videoRoute: item.videoRoute || item.generationMethod || 'apimart', videoModel: item.videoModel || '', duration: item.duration, resolution: item.resolution, ratio: item.ratio, userPrompt: item.userPrompt || '',
      actionMode: item.actionMode, actionId: item.actionId, actionName: item.actionName, sceneProfile: item.sceneProfile,
      trialBatchId: item.trialBatchId, trialJob: trialJob || null, bulkBatchId: item.bulkBatchId || null,
      jobs,
      bulk: { total: bulk.length, complete: bulk.filter(x => x.status === 'complete').length, errors: bulk.filter(x => ['error', 'needs_review'].includes(x.status)).length }
    };
  }
  list() { return this.items.slice(0, 50).map(item => this.view(item)); }
  get(id) {
    const item = this.items.find(x => x.id === id);
    if (!item) throw new Error('试片记录不存在');
    return this.view(item);
  }
  async create(input) {
    if (!this.queue.provider?.promptModel) throw new Error('请先配置 Qwen 提示词模型；实际任务的人物外貌与穿搭由大模型生成');
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('生成数量须为 1–500');
    const description = String(input.description || input.userPrompt || '').trim().slice(0, 3000);
    const referenceId = String(input.referenceId || '');
    if (!referenceId) throw new Error('请先上传并固定一张底图');
    const reference = this.references.get(referenceId);
    if (reference.analysisStatus !== 'complete' || !reference.sceneProfile) throw new Error('请先完成底图场景分析');
    const videoRoute = ['apimart', 'wan-tokendance', 'wan-aliyun', 'doubao'].includes(input.videoRoute) ? input.videoRoute : (input.generationMethod === 'doubao' ? 'doubao' : 'apimart');
    const generationMethod = videoRoute === 'doubao' ? 'doubao' : 'apimart';
    const videoModel = videoRoute.startsWith('wan-') ? 'wan3.0-video' : videoRoute === 'doubao' ? (process.env.DOUBAO_MODEL || 'seedance_v2.0_mini') : (process.env.VIDEO_MODEL || 'grok-imagine-1.5-video-ext');
    const duration = Math.max(2, Math.min(30, Math.round(Number(input.duration) || (videoRoute.startsWith('wan-') ? 5 : 6))));
    const resolution = ['480P', '720P', '1080P'].includes(String(input.resolution || '').toUpperCase()) ? String(input.resolution).toUpperCase() : '480P';
    const ratio = '9:16';
    const actionMode = input.actionMode === 'random' ? 'random' : 'manual';
    const templates = templatesWithCompatibility(reference.sceneProfile);
    const recentActionIds = this.items.slice(0, 20).map(x => x.actionId).filter(Boolean);
    const planned = [];
    for (let i = 1; i <= count; i++) {
      const template = selectTemplate({ templates, actionId: input.actionId, mode: actionMode, recentActionIds: [...recentActionIds, ...planned.map(x => x.actionId)] });
      planned.push({
        id: randomUUID(), index: i, skillId: 'foot-spa-locked-actions', skillName: template.name,
        prompt: '', promptSections: null, lockedPrompt: false, lockedActionTemplate: template,
        actionId: template.id, actionName: template.name, endState: template.endState,
        sceneProfile: reference.sceneProfile, characters: [], outfitPreferences: input.outfitPreferences || {}, description, userPrompt: description,
        referenceId, generationMethod, videoRoute, videoModel, duration, resolution, ratio, seed: Math.floor(Math.random() * 2147483647)
      });
    }
    const referenceImageUrl = videoRoute.startsWith('wan-') ? this.references.source(referenceId, 'data-url') : (videoRoute === 'apimart' ? await this.references.ensure(referenceId) : '');
    for (const job of planned) { job.referenceId = referenceId; job.referenceImageUrl = referenceImageUrl; job.generationMethod = generationMethod; }
    const batch = this.queue.enqueue([planned[0]]);
    const item = {
      id: randomUUID(), createdAt: new Date().toISOString(), skillId: 'foot-spa-locked-actions', skillName: planned[0].skillName,
      count, description, userPrompt: description, referenceId, generationMethod, videoRoute, videoModel, duration, resolution, ratio, actionMode, actionId: planned[0].actionId,
      actionName: planned[0].actionName, sceneProfile: reference.sceneProfile,
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
        const referenceImageUrl = item.videoRoute?.startsWith('wan-') ? this.references.source(item.referenceId, 'data-url') : await this.references.ensure(item.referenceId);
        for (const job of item.remaining) job.referenceImageUrl = referenceImageUrl;
      }
      if (item.remaining.length) item.bulkBatchId = this.queue.enqueue(item.remaining).id;
      else item.bulkBatchId = 'none';
      item.remaining = []; this.save();
      return this.view(item);
    } finally { this.approving.delete(id); }
  }
}
