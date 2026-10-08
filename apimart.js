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
            messages: [{ role: 'system', content: `你只负责短视频人物外貌、体型、发型与穿搭，不写场景，不写动作，不改变角色数量和 role。role 的值必须逐字复制请求中 roles 数组的对应原键（如 adult_female_staff、adult_male_guest），不得改写、翻译、省略或留空；多位角色时必须按 roles 数组顺序逐一对应。输出严格 JSON：{"characters":[{"role":"","appearance":"","clothing":""}]}。所有女性必须明确写成 22–30 岁的年轻成年亚洲女性，漂亮自然，身材匀称或曲线自然；不得出现中年、熟妇或 31 岁以上女性。服装按角色轮换日常修身裙装、亮色或有光泽的派对私服、短袖配及膝裙，但必须常规圆领或高圆领、胸线完整遮挡、面料不透明；禁止低胸、深 V、透视、抹胸、细肩带、制服和夸张开衩。多位女性造型必须可区分。男性必须是成年亚洲男性，普通成熟面容，体型从普通偏胖、微胖、壮实或瘦小中选择，只穿短袖、T恤、Polo、牛仔裤、休闲短裤或普通长裤；禁止年轻男模和高大帅气描述。文字用中文，每个字段一句简短描述。` }, {
              role: 'user', content: JSON.stringify({ roles: starter.map(x => x.role), requestedPreferences: job.outfitPreferences || {}, avoidRecent: job.recentCharacters || [] })
            }]
          })
        }, 90000);
        const content = data?.data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.content;
        const draftFailure = reason => { const error = new Error(`${reason}；模型原文：${String(content || '').slice(0, 400)}`); error.transient = true; return error; };
        let parsed;
        try { parsed = JSON.parse(String(content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { throw draftFailure('Qwen 人物穿搭未返回有效 JSON'); }
        const characters = parsed?.characters;
        if (!Array.isArray(characters) || characters.length !== starter.length) throw draftFailure('Qwen 改变了动作模板的人物数量');
        for (let i = 0; i < characters.length; i++) {
          const blank = !String(characters[i]?.appearance || '').trim() || !String(characters[i]?.clothing || '').trim();
          const roleOk = characters[i]?.role === starter[i].role;
          if (blank || (!roleOk && starter.length > 1)) throw draftFailure(`Qwen 人物字段或角色关系不符合模板（第 ${i + 1} 位期望 role=${starter[i].role}）`);
          if (!roleOk && starter.length === 1) characters[i].role = starter[i].role; // 单人模板角色无歧义，直接采用模板固定角色
          if (characters[i].role === 'adult_male_guest' && /(西装|正装|商务套装|男模|高大帅气)/.test(`${characters[i].appearance}${characters[i].clothing}`)) throw draftFailure('Qwen 返回了不允许的男性形象或正装');
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
    async draftKeyframePrompts(input) {
      if (!promptModel) throw new Error('请先配置提示词大模型');
      const count = Math.max(1, Math.min(100, Number(input.count) || 1));
      const data = await request('/v1/chat/completions', {
        method: 'POST', body: JSON.stringify({
          model: promptModel, stream: false, temperature: 0.9, max_tokens: Math.min(12000, 500 + count * 160), response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: `你是上门足浴短视频的人物提示词策划。输出严格 JSON：{"items":[{"appearance":"","clothing":""}]}，items 必须恰好 ${count} 条。每条必须明确写出 22–32 岁的年轻成年亚洲女性，不得出现 33 岁以上、中年、熟妇或老年外貌。人物必须明显不同：轮换具体年龄、脸型、眼型、眉形、鼻形、发型、发长、发色细微变化、体型和气质；不得用同一句换词冒充不同人物。服装必须彼此不同，使用日常得体的修身短袖、常规领连衣裙、高圆领 T 恤配及膝裙等，不穿工服或制服。每套服装必须常规圆领或高圆领、胸线完整遮挡、不透明；禁止低胸、深 V、乳沟、透视、露乳、抹胸、超短裙和夸张开衩。不要写场景、动作、镜头、品牌或解释，只返回 JSON。` }, {
            role: 'user', content: JSON.stringify({ count, sceneMode: input.sceneMode, focusMode: input.focusMode, footMode: input.footMode, userDirection: input.userDirection || '', retryInstruction: input.retryInstruction || '', uniqueness: '所有 appearance + clothing 组合必须唯一，且相邻人物差异优先明显' })
          }]
        })
      }, 120000);
      const content = data?.data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.content;
      try { return JSON.parse(String(content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
      catch { throw new Error('提示词大模型未返回有效人物 JSON'); }
    },
    async draftStoryPrompts(input) {
      if (!promptModel) throw new Error('请先配置提示词大模型');
      const count = Math.max(1, Math.min(30, Number(input.count) || 1));
      const data = await request('/v1/chat/completions', {
        method: 'POST', body: JSON.stringify({
          model: promptModel, stream: false, temperature: 0.88, max_tokens: Math.min(12000, 700 + count * 260), response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: `你是 15 秒中文短剧广告策划。输出严格 JSON：{"items":[{"title":"","dialogueA":"","dialogueB":"","adLine":"","action":""}]}，items 必须恰好 ${count} 条。每条只有两名成年人、三句极短对白：甲先质疑或争执，乙反驳，乙最后自然说出甲方名称和用户提供的真实卖点形成反转。每句适合 4 秒内说完，不辱骂、不打架。不同条目的冲突起因、台词和动作必须不同。不得编造用户资料以外的价格、收益、承诺、资质或官方背书。不要写镜头、时长和解释。` }, {
            role: 'user', content: JSON.stringify(input)
          }]
        })
      }, 120000);
      const content = data?.data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.content;
      try { return JSON.parse(String(content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
      catch { throw new Error('提示词大模型未返回有效短剧 JSON'); }
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
          messages: [{ role: 'system', content: `你是固定底图空间分析器。只报告图片中真实可见的空间，不推测被遮挡处，不增加门、通道、刷卡器、家具或装饰。输出严格 JSON：{"spaceType":"","description":"","fixedView":"","walkableAreas":[""],"doors":[{"position":"","cardAccess":false,"nearby":false}],"entrancesExits":[""],"perspective":"","maxPeople":1,"sceneTags":[""]}。sceneTags 只能从 corridor, visible_door, visible_card_door, nearby_visible_door, clear_walkway, side_area, ktv_private_room, karaoke_screen, microphone, sofa_area, low_table, song_selector, clear_floor, ktv_lobby, reception_desk 中选择。maxPeople 只能是 1–5。只有看得清刷卡器才标 visible_card_door；只有近处门和连续路线都明确才标 nearby_visible_door；只有足以让三人停留才标 side_area；只有明确看见 KTV 包厢特征才标 ktv_private_room；屏幕、麦克风、沙发区、矮桌、点歌台、KTV 大厅和前台都必须真实可见才标记。description 用中文客观描述固定构图、光线、家具、门和通道。` }, {
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
    async submitKeyframe(prompt) {
      const data = await request('/v1/images/generations', { method: 'POST', body: JSON.stringify({
        model: imageModel, prompt, resolution: process.env.IMAGE_RESOLUTION || '1k', quality: process.env.IMAGE_QUALITY || 'high', n: 1, output_format: 'png'
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
    async keyframeStatus(id) {
      const data = await request(`/v1/tasks/${encodeURIComponent(id)}?language=zh`);
      const task = data?.data || {};
      const state = { submitted: 'waiting', pending: 'waiting', processing: 'running', completed: 'complete', failed: 'error' }[task.status] || 'waiting';
      const imageUrls = urls(task.result?.images).map(x => x.url);
      return { status: state, url: imageUrls[0] || '', error: task.error?.message || '' };
    },
    async health() {
      await request('/v1/models', {}, 15000);
      return 'APIMart 已连接';
    }
  };
}
