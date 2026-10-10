import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const timeout = ms => AbortSignal.timeout(ms);
const originFor = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('豆包管理器地址必须是本机 127.0.0.1');
  return url.origin;
};

export class DoubaoBridge {
  constructor() { this.name = 'DoubaoManager'; this.model = process.env.DOUBAO_MODEL || 'seedance_v2.0_mini'; this.session = null; this.references = null; this.taskSnapshot = null; }
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
    try { response = await fetch(session.origin + route, { ...options, headers: { 'X-Doupool-Token': session.token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: timeout(route === '/api/accounts/import-session' ? 90000 : 15000) }); }
    catch { this.session = null; const error = new Error('豆包管理器已断开'); error.transient = true; throw error; }
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) { const error = new Error(data.detail || `豆包管理器返回 HTTP ${response.status}`); error.status = response.status; throw error; }
    return data;
  }
  async info() {
    try {
      const session = await this.discover();
      const [accounts, settings] = await Promise.all([this.request('/api/accounts'), this.request('/api/settings')]);
      const usable = accounts.filter(item => item.enabled && item.status === 'active');
      return {
        connected: true, origin: session.origin, accounts: usable.length, accountItems: accounts,
        model: this.model, ready: usable.length > 0, maxConcurrency: Number(settings.max_concurrency) || 1,
        dailyQuota: Number(settings.daily_quota) || 5,
        message: usable.length ? `${usable.length} 个可用账号 · 并发 ${Number(settings.max_concurrency) || 1}` : '管理器已连接，请先扫码登录豆包账号'
      };
    } catch (error) { return { connected: false, accounts: 0, ready: false, model: this.model, message: error.message }; }
  }
  accounts() { return this.request('/api/accounts'); }
  settings() { return this.request('/api/settings'); }
  updateSettings(input) { return this.request('/api/settings', { method: 'PUT', body: JSON.stringify(input) }); }
  importSession(input) { return this.request('/api/accounts/import-session', { method: 'POST', body: JSON.stringify(input) }); }
  startLogin() { return this.request('/api/accounts/login-attempts', { method: 'POST' }); }
  loginStatus(id) { return this.request(`/api/login-attempts/${encodeURIComponent(id)}`); }
  updateAccount(id, input) { return this.request(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }); }
  deleteAccount(id) { return this.request(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  async prepareBatch(count) {
    const [accounts, settings] = await Promise.all([this.accounts(), this.settings()]);
    const usable = accounts.filter(item => item.enabled && item.status === 'active' && Number(item.video_quota_used || 0) < Number(item.video_quota_total || settings.daily_quota || 5));
    if (!usable.length) throw new Error('没有可用的豆包执行账号，请先在本地窗口登录并同步');
    const desired = Math.max(1, Math.min(10, Math.max(1, Number(count) || 1), usable.length));
    if (Number(settings.max_concurrency) !== desired) await this.updateSettings({ max_concurrency: desired });
    return { concurrency: desired, usableAccounts: usable.length };
  }
  async submit(job) {
    const info = await this.info();
    if (!info.ready) throw new Error(info.message);
    const images = [];
    const referenceIds=[...new Set([...(Array.isArray(job.referenceImageIds)?job.referenceImageIds:[]),...(job.referenceId?[job.referenceId]:[])])];
    if(referenceIds.length>9)throw new Error('豆包图生视频最多支持 9 张参考图');
    if (referenceIds.length && ['first-frame', 'reference-image'].includes(job.referenceMode || 'first-frame')) {
      if (!this.references) throw new Error('参考图资源库未连接');
      for(const referenceId of referenceIds){
      const { item, filename } = this.references.fileFor(referenceId);
      const bytes = fs.readFileSync(filename);
      if (bytes.length > 15 * 1024 * 1024) throw new Error('豆包图生视频参考图不能超过 15MB');
      images.push({ name: item.name, data_base64: bytes.toString('base64') });
      }
    }
    const duration = Number(job.duration) || Number(process.env.DOUBAO_DURATION) || 5;
    if (![5, 10, 15].includes(duration)) throw new Error('豆包 Seedance 仅支持 5 秒、10 秒或 15 秒');
    const prompt = `视频总时长明确为 ${duration} 秒。${String(job.prompt || '')}`.slice(0, 2000);
    const task = await this.request('/api/video-tasks', { method: 'POST', body: JSON.stringify({
      prompt, model: job.videoModel || this.model,
      ratio: job.ratio || process.env.DOUBAO_RATIO || '9:16', duration,
      mode: images.length ? 'i2v' : 't2v', images
    }) });
    return { id: task.id, status: 'waiting', outputs: [] };
  }
  async status(id) {
    const now = Date.now();
    if (!this.taskSnapshot || this.taskSnapshot.until < now) {
      const pending = this.request('/api/video-tasks');
      this.taskSnapshot = { until: now + 1000, pending };
      pending.catch(() => { if (this.taskSnapshot?.pending === pending) this.taskSnapshot = null; });
    }
    const tasks = await this.taskSnapshot.pending;
    const task = tasks.find(item => item.id === id);
    if (!task) throw new Error('豆包任务不存在');
    const status = task.status === 'succeeded' ? 'complete' : ['failed', 'cancelled'].includes(task.status) ? 'error' : task.status === 'queued' ? 'waiting' : 'running';
    const url = task.result_url || task.backup_result_url || task.fallback_result_url;
    return { status, outputs: url ? [{ url }] : [], error: status === 'error' ? (task.error || task.error_message || '豆包任务已停止') : '', progress: { accountId: task.account_id || '', accountName: task.account_name || '', conversationId: task.conversation_id || '', stage: task.status, message: task.error || task.error_message || '' } };
  }
}
