import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { listSkills } from './skills.js';
import { draftMessages, cleanDraft } from './prompt-framework.js';
import { compilePrompt, makeCharacters } from './prompt-compiler.js';
import { readSecret } from './secrets.js';

const base = 'https://api.apimart.ai';
const cleanError = data => data?.error?.message || data?.message || 'API 请求失败';
const urls = value => {
  if (!value) return [];
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? [{ url: value }] : [];
  if (Array.isArray(value)) return value.flatMap(urls);
  return urls(value.url || value.video_url || value.video_urls);
};

class Gate {
  constructor(maxConcurrent = 4, perMinute = 60) {
    this.maxConcurrent = maxConcurrent; this.perMinute = perMinute;
    this.active = 0; this.times = []; this.pending = [];
  }
  run(fn) { return new Promise((resolve, reject) => { this.pending.push({ fn, resolve, reject }); this.pump(); }); }
  pump() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.times = this.times.filter(t => t > Date.now() - 60000);
    while (this.active < this.maxConcurrent && this.pending.length && this.times.length < this.perMinute) {
      const item = this.pending.shift(); this.active++; this.times.push(Date.now());
      Promise.resolve().then(item.fn).then(item.resolve, item.reject).finally(() => { this.active--; this.pump(); });
    }
    if (this.pending.length && this.times.length >= this.perMinute) {
      this.timer = setTimeout(() => this.pump(), Math.max(50, this.times[0] + 60000 - Date.now()));
      this.timer.unref();
    }
  }
}

export function createProvider({ apiKey, model }) {
  let key = apiKey || readSecret('VIDEO') || '';
  if (!key && process.env.VIDEO_API_KEY_DPAPI_FILE && fs.existsSync(process.env.VIDEO_API_KEY_DPAPI_FILE)) {
    const script = '$s=(Get-Content -LiteralPath $env:VIDEO_API_KEY_DPAPI_FILE -Raw).Trim() | ConvertTo-SecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }';
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('无法读取当前 Windows 用户加密保存的 APIMart 密钥');
    key = result.stdout.trim();
  }
  if (!key && process.env.VIDEO_API_KEY_FILE) key = fs.readFileSync(process.env.VIDEO_API_KEY_FILE, 'utf8').trim();
  if (!key) throw new Error('请配置 APIMart API key');
  const videoModel = model || 'grok-imagine-1.5-video-ext';
  const promptModel = process.env.PROMPT_MODEL || '';
  const sceneAnalysisModel = process.env.SCENE_ANALYSIS_MODEL || promptModel;
  const imageModel = process.env.IMAGE_MODEL || 'gpt-image-2.5-sunburst';
  const gate = new Gate(Math.max(1, Number(process.env.API_MAX_CONCURRENT) || 4), Math.max(1, Number(process.env.API_REQUESTS_PER_MINUTE) || 60));
  async function request(route, options = {}, timeoutMs = 45000) {
    return gate.run(async () => {
      let response;
      const headers = { Authorization: `Bearer ${key}`, ...options.headers };
      if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
      try { response = await fetch(base + route, { ...options, headers, signal: AbortSignal.timeout(timeoutMs) }); }
      catch (cause) { const error = new Error(cause.name === 'TimeoutError' ? 'APIMart 请求超时' : '无法连接 APIMart'); error.transient = true; throw error; }
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 300) }; }
      if (!response.ok || data?.error || (data?.code && data.code !== 200)) {
        const error = new Error(cleanError(data)); error.status = response.status || data.code;
        const retryAfter = Number(response.headers.get('retry-after'));
        if (retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
        throw error;
      }
      return data;
    });
  }
  return {
    name: 'APIMart', model: videoModel, promptModel, sceneAnalysisModel, imageModel, supportsIdempotency: false,
    async draft(job) {
      if (!promptModel) throw new Error('请先配置准确的 Qwen 模型 ID');
      if (job.lockedActionTemplate) {
        const starter = makeCharacters(job.lockedActionTemplate, job.index, job.outfitPreferences || {});
        const data = await request('/v1/chat/completions', {
          method: 'POST', body: JSON.stringify({ model: promptModel, stream: false, temperature: 0.75, max_tokens: 700, response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: `你只负责短视频人物外貌、体型、发型与穿搭，不写场景，不写动作，不改变角色数量和 role。输出严格 JSON：{"characters":[{"role":"","appearance":"","clothing":""}]}。女性必须是年轻成年亚洲女性，漂亮自然，身材匀称或曲线明显；衣服合身修身且得体，可轮换制服、修身长裙、挂脖裙、细肩带裙、单肩裙、短袖配短裙、T 恤配包臀裙，不能透视、走光或夸张低胸。多位女性造型必须可区分。男性必须是成年亚洲男性，普通成熟面容，体型从普通偏胖、微胖、壮实或瘦小中选择，只穿短袖、T恤、Polo、牛仔裤、休闲短裤或普通长裤；禁止西装、正装、商务套装、年轻男模、高大帅气描述。文字用中文，每个字段一句简短描述。` }, {
              role: 'user', content: JSON.stringify({ roles: starter.map(x => x.role), requestedPreferences: job.outfitPreferences || {}, avoidRecent: job.recentCharacters || [] })
            }]
          })
        }, 90000);
        const content = data?.data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.content;
        let parsed;
        try { parsed = JSON.parse(String(content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { throw new Error('Qwen 人物穿搭未返回有效 JSON'); }
        const characters = parsed?.characters;
        if (!Array.isArray(characters) || characters.length !== starter.length) throw new Error('Qwen 改变了动作模板的人物数量');
        for (let i = 0; i < characters.length; i++) {
          if (characters[i]?.role !== starter[i].role || !String(characters[i]?.appearance || '').trim() || !String(characters[i]?.clothing || '').trim()) throw new Error('Qwen 人物字段或角色关系不符合模板');
          if (characters[i].role === 'adult_male_guest' && /(西装|正装|商务套装|男模|高大帅气)/.test(`${characters[i].appearance}${characters[i].clothing}`)) throw new Error('Qwen 返回了不允许的男性形象或正装');
        }
        const compiled = compilePrompt({ referenceId: job.referenceId, sceneProfile: job.sceneProfile, template: job.lockedActionTemplate, characters, duration: Number(job.duration) || Number(process.env.VIDEO_DURATION) || 6, aspectRatio: job.ratio || process.env.VIDEO_SIZE || '9:16', index: job.index, userPrompt: job.userPrompt || '' });
        return { prompt: compiled.prompt, characters, promptSections: compiled.sections };
      }
      const skill = listSkills().find(item => item.id === job.skillId);
      const data = await request('/v1/chat/completions', {
        method: 'POST', body: JSON.stringify({ model: promptModel, stream: false, temperature: 0.65, max_tokens: 400,
          messages: draftMessages(job, skill) })
      }, 90000);
      const content = data?.data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.content;
      return cleanDraft(content);
    },
    async submit(job) {
      const payload = { model: job.videoModel || videoModel, prompt: job.prompt, size: job.ratio || process.env.VIDEO_SIZE || '9:16', duration: Number(job.duration) || Number(process.env.VIDEO_DURATION) || 6, resolution: String(job.resolution || process.env.VIDEO_RESOLUTION || '480P').toLowerCase() };
      if (job.referenceImageUrl) payload.image_urls = [job.referenceImageUrl];
      const data = await request('/v1/videos/generations', {
        method: 'POST', body: JSON.stringify(payload)
      }, 60000);
      const task = data?.data?.[0];
      if (!task?.task_id) throw new Error('APIMart 未返回任务 ID');
      return { id: task.task_id, status: 'waiting', outputs: [] };
    },
    async status(id) {
      const data = await request(`/v1/tasks/${encodeURIComponent(id)}?language=zh`);
      const task = data?.data || {};
      const state = { pending: 'waiting', submitted: 'waiting', processing: 'running', completed: 'complete', failed: 'error', cancelled: 'error' }[task.status] || 'waiting';
      return { status: state, outputs: urls(task.result?.videos), error: task.error?.message || '' };
    },
    async uploadImage(bytes, filename, mime) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime }), filename);
      const data = await request('/v1/uploads/images', { method: 'POST', body: form }, 120000);
      if (!/^https:\/\//.test(data?.url || '')) throw new Error('APIMart 未返回图片 URL');
      return data.url;
    },
    async analyzeScene(imageUrl) {
      if (!sceneAnalysisModel) throw new Error('请先配置支持图片理解的场景分析模型 ID');
      const data = await request('/v1/chat/completions', {
        method: 'POST', body: JSON.stringify({
          model: sceneAnalysisModel, stream: false, temperature: 0.1, max_tokens: 900,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: `你是固定底图空间分析器。只报告图片中真实可见的空间，不推测被遮挡处，不增加门、通道、刷卡器或装饰。输出严格 JSON：{"spaceType":"","description":"","fixedView":"","walkableAreas":[""],"doors":[{"position":"","cardAccess":false,"nearby":false}],"entrancesExits":[""],"perspective":"","maxPeople":1,"sceneTags":[""]}。sceneTags 只能从 corridor, visible_door, visible_card_door, nearby_visible_door, clear_walkway, side_area 中选择。maxPeople 只能是 1、2 或 3。只有看得清刷卡器才标 visible_card_door；只有近处门和连续路线都明确才标 nearby_visible_door；只有足以让三人原地停留才标 side_area。description 用中文客观描述固定构图、光线、门和通道。` }, {
            role: 'user', content: [{ type: 'text', text: '分析这张固定底图，只返回 JSON。' }, { type: 'image_url', image_url: { url: imageUrl } }]
          }]
        })
      }, 120000);
      const content = data?.data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.content;
      const clean = String(content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      let result;
      try { result = JSON.parse(clean); } catch { throw new Error('场景分析模型未返回有效 JSON'); }
      return result;
    },
    async submitImageTransform(imageUrl, prompt) {
      const data = await request('/v1/images/generations', { method: 'POST', body: JSON.stringify({
        model: imageModel, prompt, image_urls: [imageUrl], resolution: process.env.IMAGE_RESOLUTION || '1k', quality: process.env.IMAGE_QUALITY || 'high', n: 1, output_format: 'png'
      }) }, 60000);
      const task = data?.data?.[0];
      if (!task?.task_id) throw new Error('APIMart 生图接口未返回任务 ID');
      return { id: task.task_id, status: 'waiting' };
    },
    async imageTransformStatus(id) {
      const data = await request(`/v1/tasks/${encodeURIComponent(id)}?language=zh`);
      const task = data?.data || {};
      const state = { submitted: 'waiting', pending: 'waiting', processing: 'running', completed: 'complete', failed: 'error' }[task.status] || 'waiting';
      const imageUrls = urls(task.result?.images).map(x => x.url);
      return { status: state, url: imageUrls[0] || '', error: task.error?.message || '' };
    },
    async health() { return '已配置'; }
  };
}
