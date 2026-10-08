import { readSecret } from './secrets.js';

const cleanError = data => data?.output?.message || data?.message || data?.error?.message || 'Wan3 API 请求失败';
const stateOf = value => ({ PENDING: 'waiting', RUNNING: 'running', SUCCEEDED: 'complete', FAILED: 'error', CANCELED: 'error', UNKNOWN: 'error' }[String(value || '').toUpperCase()] || 'waiting');
export const shouldGenerateAudio = prompt => /(?:音乐|配乐|背景音乐|music|soundtrack)/i.test(String(prompt || ''));

export function createWanProvider({ id, name, keyPrefix, submitUrl, tasksBaseUrl, fetchImpl = fetch }) {
  const key = readSecret(keyPrefix);
  async function request(url, options = {}, timeoutMs = 45000) {
    let response;
    try {
      response = await fetchImpl(url, { ...options, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      const error = new Error(cause.name === 'TimeoutError' ? `${name} 请求超时` : `无法连接 ${name}`);
      error.transient = true; throw error;
    }
    const raw = await response.text(); let data;
    try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 300) }; }
    if (!response.ok || data?.code && !data?.output?.task_id) { const error = new Error(cleanError(data)); error.status = response.status; throw error; }
    return data;
  }
  return {
    id, name, model: 'wan3.0-video', configured: Boolean(key), supportsIdempotency: false,
    async submit(job) {
      if (!key) throw new Error(`${name} 尚未配置 API Key`);
      const input = { prompt: String(job.prompt || '').slice(0, 20000) };
      const imageMode = job.referenceMode === 'reference-image' ? 'reference-image' : 'first-frame';
      if (job.referenceImageUrl) input.media = [{ type: imageMode === 'reference-image' ? 'reference_image' : 'first_frame', url: job.referenceImageUrl }];
      const payload = { model: 'wan3.0-video', input, parameters: {
        resolution: normalizeResolution(job.resolution), ratio: imageMode === 'first-frame' && job.referenceImageUrl ? 'adaptive' : (job.ratio || '9:16'),
        duration: normalizeDuration(job.duration), audio: shouldGenerateAudio(job.prompt), watermark: false, prompt_extend: false, seed: normalizeSeed(job.seed)
      } };
      const data = await request(submitUrl, { method: 'POST', headers: { 'X-DashScope-Async': 'enable' }, body: JSON.stringify(payload) }, 60000);
      const taskId = data?.output?.task_id;
      if (!taskId) throw new Error(`${name} 未返回 task_id`);
      return { id: taskId, status: 'waiting', outputs: [] };
    },
    async status(taskId) {
      if (!key) throw new Error(`${name} 尚未配置 API Key`);
      const data = await request(`${tasksBaseUrl}/${encodeURIComponent(taskId)}`);
      const output = data?.output || {};
      return { status: stateOf(output.task_status), outputs: output.video_url ? [{ url: output.video_url }] : [], error: output.task_status === 'FAILED' ? cleanError(data) : '' };
    }
  };
}

export function createWanProviders(options = {}) {
  return {
    'wan-tokendance': createWanProvider({ id: 'wan-tokendance', name: 'TokenDance Wan3', keyPrefix: 'TOKENDANCE', submitUrl: process.env.TOKENDANCE_WAN_SUBMIT_URL || 'https://tokendance.space/gateway/alibaba/wan3/v1/video-synthesis', tasksBaseUrl: process.env.TOKENDANCE_WAN_TASKS_URL || 'https://tokendance.space/gateway/alibaba/wan3/v1/tasks', ...options }),
    'wan-aliyun': createWanProvider({ id: 'wan-aliyun', name: '阿里云百炼 Wan3', keyPrefix: 'DASHSCOPE', submitUrl: process.env.DASHSCOPE_WAN_SUBMIT_URL || 'https://maas.qianwenaiapi.com/api/v1/services/aigc/video-generation/video-synthesis', tasksBaseUrl: process.env.DASHSCOPE_WAN_TASKS_URL || 'https://maas.qianwenaiapi.com/api/v1/tasks', ...options })
  };
}

export function normalizeResolution(value) { const upper = String(value || '480P').toUpperCase(); return ['480P', '720P', '1080P'].includes(upper) ? upper : '480P'; }
export function normalizeDuration(value) { return Math.max(2, Math.min(30, Math.round(Number(value) || 5))); }
export function normalizeSeed(value) {
  if (value === -1) return -1;
  if (!Number.isInteger(value) || value < 0) return -1;
  return value % 2147483648;
}
