import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const timeout = ms => AbortSignal.timeout(ms);
const originFor = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('豆包管理器地址必须是本机 127.0.0.1');
  return url.origin;
};

export class DoubaoBridge {
  constructor() { this.name = 'DoubaoManager'; this.model = process.env.DOUBAO_MODEL || 'seedance_v2.0_mini'; this.session = null; this.references = null; }
  setReferences(references) { this.references = references; }
  async candidates() {
    if (process.env.DOUBAO_MANAGER_URL) return [originFor(process.env.DOUBAO_MANAGER_URL)];
    if (process.platform !== 'win32') return [];
    const result = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', timeout: 8000 });
    if (result.status !== 0) return [];
    const ports = new Set();
    for (const line of result.stdout.split(/\r?\n/)) {
      const match = /\s127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\b/i.exec(line);
      if (match) ports.add(Number(match[1]));
    }
    return [...ports].map(port => `http://127.0.0.1:${port}`);
  }
  async discover(force = false) {
    if (!force && this.session && this.session.until > Date.now()) return this.session;
    const candidates = await this.candidates();
    for (const origin of candidates) {
      try {
        const health = await fetch(origin + '/api/health', { signal: timeout(900) });
        if (!health.ok || (await health.json()).status !== 'ok') continue;
        const page = await fetch(origin + '/', { signal: timeout(1500) });
        const html = await page.text();
        const token = /<meta\s+name="doupool-token"\s+content="([^"]+)"/i.exec(html)?.[1];
        if (!token) continue;
        this.session = { origin, token, until: Date.now() + 30000 };
        return this.session;
      } catch { /* unrelated local service */ }
    }
    this.session = null;
    throw new Error('未找到正在运行的 DoubaoManager。请先启动它并登录豆包账号。');
  }
  async request(route, options = {}) {
    const session = await this.discover();
    let response;
    try { response = await fetch(session.origin + route, { ...options, headers: { 'X-Doupool-Token': session.token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: timeout(15000) }); }
    catch { this.session = null; const error = new Error('豆包管理器已断开'); error.transient = true; throw error; }
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) { const error = new Error(data.detail || `豆包管理器返回 HTTP ${response.status}`); error.status = response.status; throw error; }
    return data;
  }
  async info() {
    try {
      const session = await this.discover();
      const accounts = await this.request('/api/accounts');
      const usable = accounts.filter(item => item.enabled && item.status === 'active');
      return { connected: true, origin: session.origin, accounts: usable.length, model: this.model, ready: usable.length > 0, message: usable.length ? `${usable.length} 个可用账号` : '管理器已连接，请先扫码登录豆包账号' };
    } catch (error) { return { connected: false, accounts: 0, ready: false, model: this.model, message: error.message }; }
  }
  async submit(job) {
    const info = await this.info();
    if (!info.ready) throw new Error(info.message);
    const images = [];
    if (job.referenceId) {
      if (!this.references) throw new Error('参考图资源库未连接');
      const { item, filename } = this.references.fileFor(job.referenceId);
      const bytes = fs.readFileSync(filename);
      if (bytes.length > 15 * 1024 * 1024) throw new Error('豆包图生视频参考图不能超过 15MB');
      images.push({ name: item.name, data_base64: bytes.toString('base64') });
    }
    const duration = Math.max(2, Math.min(30, Number(job.duration) || Number(process.env.DOUBAO_DURATION) || 5));
    const prompt = `视频总时长明确为 ${duration} 秒。${String(job.prompt || '')}`.slice(0, 2000);
    const task = await this.request('/api/video-tasks', { method: 'POST', body: JSON.stringify({
      prompt, model: job.videoModel || this.model,
      ratio: job.ratio || process.env.DOUBAO_RATIO || '9:16', duration,
      resolution: String(job.resolution || '480P').toLowerCase(),
      mode: images.length ? 'i2v' : 't2v', images
    }) });
    return { id: task.id, status: 'waiting', outputs: [] };
  }
  async status(id) {
    const tasks = await this.request('/api/video-tasks');
    const task = tasks.find(item => item.id === id);
    if (!task) throw new Error('豆包任务不存在');
    const status = task.status === 'succeeded' ? 'complete' : task.status === 'failed' ? 'error' : task.status === 'queued' ? 'waiting' : 'running';
    const url = task.result_url || task.backup_result_url || task.fallback_result_url;
    return { status, outputs: url ? [{ url }] : [], error: task.error || '' };
  }
}
