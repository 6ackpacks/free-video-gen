import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const now = () => Date.now();
const retryDelay = (attempt, error) => Math.min(120000, Math.max(Number(error?.retryAfterMs) || 0, 1500 * 2 ** Math.min(attempt, 6) + Math.floor(Math.random() * 1000)));
export class VideoQueue {
  constructor(file, provider, limits = {}) {
    this.file = file;
    this.provider = provider;
    this.maxSubmits = Math.max(1, Number(limits.maxSubmits) || 4);
    this.maxDrafts = Math.max(1, Number(limits.maxDrafts) || 4);
    this.maxPolls = Math.max(1, Number(limits.maxPolls) || 8);
    this.submitsPerMinute = Math.max(1, Number(limits.submitsPerMinute) || 60);
    this.submitTimes = [];
    this.submitting = new Set();
    this.drafting = new Set();
    this.polling = new Set();
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { batches: [], jobs: [] };
    for (const job of this.state.jobs) {
      if (job.status === 'submitting') job.status = provider?.supportsIdempotency ? 'queued' : 'needs_review';
      if (job.status === 'drafting') job.status = 'draft_pending';
    }
    this.save();
    this.timer = setInterval(() => { this.pump(); this.poll(); }, 1500);
    this.timer.unref();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, this.file);
  }
  enqueue(planned, { reviewFirst = false } = {}) {
    if (!this.provider) throw new Error('视频 API 尚未配置');
    const batch = { id: randomUUID(), createdAt: new Date().toISOString(), count: planned.length };
    const jobs = planned.map(job => ({ ...job, batchId: batch.id, status: job.lockedPrompt ? 'queued' : (this.provider.draft && this.provider.promptModel ? 'draft_pending' : 'queued'), providerId: null, outputs: [], attempts: 0, draftAttempts: 0, nextAt: 0, error: '', createdAt: batch.createdAt }));
    if (reviewFirst && jobs.length > 1) {
      batch.reviewFirst = true; batch.trialJobId = jobs[0].id;
      for (const job of jobs.slice(1)) { job.reviewResumeStatus = job.status; job.status = 'review_pending'; }
    }
    this.state.batches.unshift(batch);
    this.state.jobs.unshift(...jobs);
    this.save();
    queueMicrotask(() => this.pump());
    return batch;
  }
  review(batchId) {
    const batch = this.state.batches.find(b => b.id === batchId);
    if (!batch) throw Error('视频批次不存在');
    const first = this.state.jobs.find(j => j.id === batch.trialJobId);
    return { batchId, required: !!batch.reviewFirst, approved: !!batch.reviewedAt, trialJobId: batch.trialJobId || '', ready: first?.status === 'complete' && !!first.outputs?.length, remaining: this.state.jobs.filter(j => j.batchId === batchId && j.status === 'review_pending').length };
  }
  approveReview(batchId) {
    const state = this.review(batchId);
    if (!state.required || state.approved) return state;
    if (!state.ready) throw Error('请等待试片完成并预览后，再确认生成剩余视频');
    for (const job of this.state.jobs) if (job.batchId === batchId && job.status === 'review_pending') { job.status = job.reviewResumeStatus || 'queued'; delete job.reviewResumeStatus; }
    this.state.batches.find(b => b.id === batchId).reviewedAt = new Date().toISOString();
    this.save(); queueMicrotask(() => this.pump()); return this.review(batchId);
  }
  pump() {
    if (!this.provider) return;
    for (const job of this.state.jobs) {
      if (this.drafting.size >= this.maxDrafts) break;
      if (job.status !== 'draft_pending' || job.nextAt > now()) continue;
      job.status = 'drafting'; job.draftAttempts++;
      this.drafting.add(job.id); this.save();
      Promise.resolve().then(() => this.provider.draft(job))
        .then(result => {
          const prompt = typeof result === 'string' ? result : result?.prompt;
          if (!String(prompt || '').trim()) throw new Error('Qwen 未返回提示词');
          if (Array.isArray(result?.characters) && !Object.values(job.outfitPreferences || {}).some(Boolean)) {
            const signature = result.characters.map(x => `${x.appearance}|${x.clothing}`).join('||');
            const duplicate = this.state.jobs.some(other => other.id !== job.id && other.batchId === job.batchId && Array.isArray(other.characters) && other.characters.map(x => `${x.appearance}|${x.clothing}`).join('||') === signature);
            if (duplicate) { const error = new Error('Qwen 返回了本批已使用的人物穿搭组合，正在重新生成'); error.transient = true; throw error; }
          }
          job.prompt = String(prompt).trim();
          if (result && typeof result === 'object') { job.characters = result.characters || job.characters; job.promptSections = result.promptSections || job.promptSections; job.promptSource = result.promptSource || job.promptSource; }
          job.status = 'queued'; job.error = ''; job.nextAt = 0;
          this.save();
        })
        .catch(error => {
          job.error = error.message || String(error);
          job.status = job.draftAttempts < 6 && (error.status === 429 || error.status >= 500 || error.transient) ? 'draft_pending' : 'error';
          job.nextAt = now() + retryDelay(job.draftAttempts, error);
          this.save();
        })
        .finally(() => { this.drafting.delete(job.id); this.pump(); });
    }
    this.submitTimes = this.submitTimes.filter(time => time > now() - 60000);
    for (const job of this.state.jobs) {
      if (this.submitting.size >= this.maxSubmits) break;
      if (this.submitTimes.length >= this.submitsPerMinute) break;
      if (job.status !== 'queued' || job.nextAt > now()) continue;
      job.status = 'submitting'; job.attempts++;
      this.submitTimes.push(now());
      this.submitting.add(job.id); this.save();
      Promise.resolve().then(() => this.provider.submit({ ...job, idempotencyKey: job.id }))
        .then(result => {
          if (!result?.id) throw new Error('视频 API 未返回任务 ID');
          job.providerId = result.id;
          job.status = ['complete', 'error', 'running'].includes(result.status) ? result.status : 'waiting';
          job.outputs = result.outputs || [];
          job.error = result.error || '';
          job.nextAt = now() + 5000;
          this.save();
        })
        .catch(error => {
          job.error = error.message || String(error);
          const retryable = error.status === 429 || (this.provider.supportsIdempotency && (error.status >= 500 || error.transient));
          job.status = job.attempts < 6 && retryable ? 'queued' : (!this.provider.supportsIdempotency && (error.status >= 500 || error.transient) ? 'needs_review' : 'error');
          job.nextAt = now() + retryDelay(job.attempts, error);
          this.save();
        })
        .finally(() => { this.submitting.delete(job.id); this.pump(); });
    }
  }
  poll() {
    if (!this.provider) return;
    for (const job of this.state.jobs) {
      if (this.polling.size >= this.maxPolls) break;
      if (!['waiting', 'running'].includes(job.status) || job.nextAt > now() || !job.providerId || this.polling.has(job.id)) continue;
      this.polling.add(job.id);
      Promise.resolve().then(() => this.provider.status(job.providerId, job))
        .then(result => {
          job.status = result.status;
          if (result.progress) job.providerProgress = result.progress;
          job.outputs = result.outputs || job.outputs;
          job.error = result.error || '';
          job.nextAt = now() + 5000;
          this.save();
        })
        .catch(error => {
          job.error = error.message || String(error);
          job.nextAt = now() + retryDelay(1, error);
          this.save();
        })
        .finally(() => this.polling.delete(job.id));
    }
  }
  snapshot(batchId) {
    return { batches: this.state.batches, jobs: batchId ? this.state.jobs.filter(job => job.batchId === batchId) : this.state.jobs.slice(0, 300) };
  }
  retry(jobId) {
    const job = this.state.jobs.find(item => item.id === jobId);
    if (!job) throw new Error('视频任务不存在');
    if (!['error', 'needs_review'].includes(job.status)) throw new Error('只能重试失败或待确认的任务');
    const needsDraft = this.provider?.draft && this.provider?.promptModel && !String(job.prompt || '').trim();
    job.status = needsDraft ? 'draft_pending' : 'queued';
    job.error = '';
    job.providerId = null;
    job.attempts = 0;
    job.draftAttempts = 0;
    job.nextAt = 0;
    this.save();
    queueMicrotask(() => this.pump());
    return job;
  }
}
