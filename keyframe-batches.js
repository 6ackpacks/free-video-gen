import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { planPromptPairs, YIQU_TEMPLATE } from './paired-prompts.js';
import { planPairedVideoJobs } from './paired-batches.js';
import { validateReviewedPromptItems } from './prompt-batches.js';
import { buildFlexibleVideoDirection } from './video-directions.js';

const now = () => Date.now();
const retryDelay = attempt => Math.min(60000, 1500 * 2 ** Math.min(attempt, 5));

export class KeyframeBatchManager {
  constructor(file, provider, references, queue, limits = {}) {
    this.file = file; this.provider = provider; this.references = references; this.queue = queue;
    this.maxSubmits = Math.max(1, Number(limits.maxSubmits) || 3);
    this.maxPolls = Math.max(1, Number(limits.maxPolls) || 6);
    this.submitting = new Set(); this.polling = new Set();
    this.items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    for (const batch of this.items) for (const item of batch.items || []) {
      if (item.status === 'submitting') item.status = item.providerId ? 'waiting' : 'queued';
    }
    this.save();
    this.timer = setInterval(() => this.pump(), 1500); this.timer.unref();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  find(id) { const item = this.items.find(x => x.id === id); if (!item) throw new Error('首帧批次不存在'); return item; }
  view(batch) {
    const items = (batch.items || []).map(item => ({ ...item, previewUrl: item.resultReferenceId ? `/api/references/${item.resultReferenceId}/image` : '' }));
    return {
      ...batch, items,
      progress: {
        total: items.length,
        complete: items.filter(x => x.status === 'complete').length,
        active: items.filter(x => ['queued', 'submitting', 'waiting', 'running', 'complete_pending_download'].includes(x.status)).length,
        errors: items.filter(x => x.status === 'error').length
      }
    };
  }
  list() { return this.items.slice(0, 30).map(x => this.view(x)); }
  get(id) { return this.view(this.find(id)); }
  create(input) {
    if (!this.provider?.submitKeyframe || !this.provider?.keyframeStatus) throw new Error('尚未配置可用的首帧图片模型');
    const pairs = Array.isArray(input.items) ? validateReviewedPromptItems(input.items) : planPromptPairs(input);
    const batch = {
      id: randomUUID(), templateId: YIQU_TEMPLATE.id, templateName: YIQU_TEMPLATE.name,
      createdAt: new Date().toISOString(), confirmedAt: '', videoBatchId: '', settings: {
        sceneMode: input.sceneMode || 'mixed', focusMode: input.focusMode || 'mixed', footMode: input.footMode || 'mixed',
        imagePrompt: String(input.imagePrompt || ''), videoPrompt: String(input.videoPrompt || '')
      },
      items: pairs.map(pair => ({
        ...pair, pairId: pair.id, status: 'queued', providerId: '', resultReferenceId: '', error: '', attempts: 0, nextAt: 0, generation: 1
      }))
    };
    this.items.unshift(batch); this.save(); queueMicrotask(() => this.pump()); return this.view(batch);
  }
  pump() {
    for (const batch of this.items) for (const item of batch.items || []) {
      if (this.submitting.size >= this.maxSubmits) return;
      if (item.status !== 'queued' || item.nextAt > now()) continue;
      item.status = 'submitting'; item.attempts++; this.submitting.add(item.id); this.save();
      Promise.resolve().then(() => this.provider.submitKeyframe(item.imagePrompt, { seed: item.seed, pairId: item.pairId }))
        .then(result => {
          if (!result?.id) throw new Error('图片模型未返回任务 ID');
          item.providerId = result.id; item.status = result.status === 'complete' ? 'complete_pending_download' : 'waiting'; item.error = ''; item.nextAt = now() + 3000; this.save();
        })
        .catch(error => {
          item.error = error.message || String(error);
          item.status = item.attempts < 4 && (error.status === 429 || error.status >= 500 || error.transient) ? 'queued' : 'error';
          item.nextAt = now() + retryDelay(item.attempts); this.save();
        })
        .finally(() => { this.submitting.delete(item.id); this.pump(); });
    }
  }
  async download(item, url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`生成图片下载失败：HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = String(response.headers.get('content-type') || 'image/png').split(';')[0];
    const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(contentType) ? contentType : 'image/png';
    const ref = this.references.addBuffer({ name: `伊趣舒心首帧 ${item.index}-${item.generation}`, mime, bytes, purpose: 'paired-keyframe' });
    item.resultReferenceId = ref.id; item.status = 'complete'; item.error = '';
  }
  async refresh(id) {
    const batch = this.find(id);
    const candidates = (batch.items || []).filter(item => ['waiting', 'running', 'complete_pending_download'].includes(item.status) && item.nextAt <= now());
    await Promise.all(candidates.slice(0, this.maxPolls).map(async item => {
      if (this.polling.has(item.id)) return;
      this.polling.add(item.id);
      try {
        const state = await this.provider.keyframeStatus(item.providerId);
        item.status = state.status; item.error = state.error || ''; item.nextAt = now() + 3000;
        if (state.status === 'complete') {
          if (!state.url) throw new Error('图片任务完成但没有返回图片地址');
          await this.download(item, state.url);
        }
      } catch (error) { item.error = error.message || String(error); item.status = 'error'; }
      finally { this.polling.delete(item.id); }
    }));
    this.save(); this.pump(); return this.view(batch);
  }
  regenerate(id, itemIds) {
    const batch = this.find(id); const selected = new Set(Array.isArray(itemIds) ? itemIds : []);
    if (!selected.size) throw new Error('请选择需要重生成的图片');
    for (const item of batch.items || []) if (selected.has(item.id)) {
      item.providerId = ''; item.resultReferenceId = ''; item.status = 'queued'; item.error = ''; item.attempts = 0; item.nextAt = 0; item.generation++;
      item.seed = Math.floor(Math.random() * 2147483647);
      item.imagePrompt = `${item.imagePrompt}\n本次重新生成编号：${item.generation}-${item.seed}。保持约束但更换具体人物面貌、家庭细节和拍摄瞬间。`;
    }
    this.save(); this.pump(); return this.view(batch);
  }
  async confirm(id, input) {
    const batch = this.find(id);
    const selected = new Set(Array.isArray(input.itemIds) ? input.itemIds : []);
    const accepted = (batch.items || []).filter(item => selected.has(item.id));
    if (!accepted.length) throw new Error('至少确认一张图片');
    if (accepted.some(item => item.status !== 'complete' || !item.resultReferenceId)) throw new Error('只能确认已经生成完成的图片');
    const directions = input.itemDirections && typeof input.itemDirections === 'object' ? input.itemDirections : {};
    const batchPrompt = String(input.batchVideoPrompt || '').trim().slice(0, 3000);
    const jobs = await planPairedVideoJobs({
      ...input, templateId: batch.templateId, templateName: batch.templateName,
      items: accepted.map(item => {
        const direction = buildFlexibleVideoDirection({ index: item.index, variation: item.variation, batchPrompt, itemPrompt: String(directions[item.id] || '').slice(0, 3000) });
        return { pairId: item.pairId, referenceId: item.resultReferenceId, referenceMode: direction.referenceMode, videoPrompt: direction.prompt, promptVersion: direction.promptVersion, camera: direction.camera, motion: direction.motion, userDirection: direction.userDirection, variation: item.variation, seed: item.seed };
      })
    }, this.references);
    const videoBatch = this.queue.enqueue(jobs, { reviewFirst: true });
    batch.videoBatchIds = Array.isArray(batch.videoBatchIds) ? batch.videoBatchIds : (batch.videoBatchId ? [batch.videoBatchId] : []);
    batch.videoBatchIds.push(videoBatch.id); batch.videoBatchId = videoBatch.id; batch.confirmedAt = new Date().toISOString(); batch.acceptedItemIds = [...selected]; this.save();
    return { imageBatch: this.view(batch), videoBatch };
  }
}
