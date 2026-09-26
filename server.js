import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSkills, saveSkill, planBatch } from './skills.js';
import { loadProvider } from './provider.js';
import { VideoQueue } from './queue.js';
import { ReferenceLibrary } from './references.js';
import { TrialManager } from './trials.js';
import { MediaStore } from './media.js';
import { loadActionTemplates, templatesWithCompatibility } from './action-templates.js';
import { compilePrompt, makeCharacters, selectTemplate } from './prompt-compiler.js';
import { ImageTransformManager } from './image-transforms.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const provider = await loadProvider();
const queue = new VideoQueue(path.join(root, 'data', 'queue.json'), provider, {
  maxSubmits: process.env.VIDEO_MAX_SUBMITS,
  maxDrafts: process.env.PROMPT_MAX_CONCURRENT,
  maxPolls: process.env.VIDEO_MAX_POLLS,
  submitsPerMinute: process.env.VIDEO_SUBMITS_PER_MINUTE
});
const references = new ReferenceLibrary(path.join(root, 'data'), provider);
provider?.setReferences?.(references);
const trials = new TrialManager(path.join(root, 'data', 'trials.json'), queue, references);
const media = new MediaStore(path.join(root, 'data', 'videos'));
const imageTransforms = new ImageTransformManager(path.join(root, 'data'), provider, references);
const trialJobs = id => {
  const trial = trials.get(id);
  return queue.state.jobs.filter(job => job.batchId === trial.trialBatchId || (trial.bulkBatchId && job.batchId === trial.bulkBatchId)).sort((a, b) => a.index - b.index);
};
const reply = (res, status, value, contentType = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(value) : value);
};
const body = async (req, max = 2_000_000) => {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > max) throw new Error('请求内容过大');
  }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('JSON 格式无效'); }
};
const api = async (req, res, url) => {
  const route = url.pathname;
  if (route === '/api/provider' && req.method === 'GET') return reply(res, 200, {
    configured: !!provider?.configured, name: provider?.name || '', model: provider?.model || '', promptModel: provider?.promptModel || '', sceneAnalysisModel: provider?.sceneAnalysisModel || '', imageModel: provider?.imageModel || '', routes: provider?.routes || [],
    maxSubmits: queue.maxSubmits, maxDrafts: queue.maxDrafts, maxPolls: queue.maxPolls, submitsPerMinute: queue.submitsPerMinute
  });
  if (route === '/api/health' && req.method === 'GET') {
    if (!provider) return reply(res, 200, { connected: false, error: '尚未配置视频 API' });
    try { return reply(res, 200, { connected: true, provider: await provider.health?.() || provider.name }); }
    catch (error) { return reply(res, 200, { connected: false, error: error.message }); }
  }
  if (route === '/api/doubao' && req.method === 'GET') return reply(res, 200, await provider.doubao.info());
  if (route === '/api/skills' && req.method === 'GET') return reply(res, 200, listSkills());
  if (route === '/api/skills' && req.method === 'POST') return reply(res, 201, saveSkill(await body(req)));
  const skillMatch = /^\/api\/skills\/([a-f0-9-]{36})$/i.exec(route);
  if (skillMatch && req.method === 'PUT') {
    if (!listSkills().some(skill => skill.id === skillMatch[1])) return reply(res, 404, { error: 'skill 不存在' });
    return reply(res, 200, saveSkill(await body(req), skillMatch[1]));
  }
  if (route === '/api/plan' && req.method === 'POST') return reply(res, 200, planBatch(await body(req)));
  if (route === '/api/actions' && req.method === 'GET') {
    const referenceId = url.searchParams.get('referenceId') || '';
    const sceneProfile = referenceId ? references.get(referenceId).sceneProfile : null;
    return reply(res, 200, sceneProfile ? templatesWithCompatibility(sceneProfile) : loadActionTemplates().map(item => ({ ...item, compatibility: { compatible: false, reasons: ['请先固定并分析底图'] } })));
  }
  if (route === '/api/references' && req.method === 'GET') return reply(res, 200, references.list());
  if (route === '/api/references' && req.method === 'POST') return reply(res, 201, references.add(await body(req, 29_000_000)));
  if (route === '/api/image-transforms' && req.method === 'GET') return reply(res, 200, imageTransforms.list());
  if (route === '/api/image-transforms' && req.method === 'POST') {
    const input = await body(req); return reply(res, 201, await imageTransforms.create(String(input.referenceId || '')));
  }
  const transformMatch = /^\/api\/image-transforms\/([a-f0-9-]{36})$/i.exec(route);
  if (transformMatch && req.method === 'GET') return reply(res, 200, await imageTransforms.refresh(transformMatch[1]));
  const analyzeMatch = /^\/api\/references\/([a-f0-9-]{36})\/analyze$/i.exec(route);
  if (analyzeMatch && req.method === 'POST') {
    const input = await body(req);
    return reply(res, 200, await references.analyze(analyzeMatch[1], input.sceneProfile || null));
  }
  const previewMatch = /^\/api\/references\/([a-f0-9-]{36})\/prompt-preview$/i.exec(route);
  if (previewMatch && req.method === 'POST') {
    const input = await body(req);
    const reference = references.get(previewMatch[1]);
    if (!reference.sceneProfile) throw new Error('请先完成底图场景分析');
    const templates = templatesWithCompatibility(reference.sceneProfile);
    const template = selectTemplate({ templates, actionId: input.actionId, mode: input.actionMode });
    const characters = makeCharacters(template, Number(input.variantIndex) || 1, input.outfitPreferences || {});
    return reply(res, 200, compilePrompt({ referenceId: reference.id, sceneProfile: reference.sceneProfile, template, characters, duration: Math.max(2, Math.min(30, Number(input.duration) || 5)), aspectRatio: '9:16', userPrompt: String(input.userPrompt || '').slice(0, 3000) }));
  }
  const imageMatch = /^\/api\/references\/([a-f0-9-]{36})\/image$/i.exec(route);
  if (imageMatch && req.method === 'GET') {
    const { item, filename } = references.fileFor(imageMatch[1]);
    return reply(res, 200, fs.readFileSync(filename), item.mime);
  }
  if (route === '/api/trials' && req.method === 'GET') return reply(res, 200, trials.list());
  if (route === '/api/trials' && req.method === 'POST') {
    const input = await body(req);
    const requestedRoute = input.videoRoute || (input.generationMethod === 'doubao' ? 'doubao' : 'apimart');
    const routeInfo = provider.routes?.find(item => item.id === requestedRoute);
    if (!routeInfo) throw new Error('视频模型路由不存在');
    if (requestedRoute === 'doubao' && !(await provider.doubao.info()).ready) throw new Error('豆包管理器未就绪，请先启动并登录账号');
    if (requestedRoute !== 'doubao' && !routeInfo.configured) throw new Error(`${routeInfo.name} 尚未配置 API Key`);
    return reply(res, 201, await trials.create(input));
  }
  const trialMatch = /^\/api\/trials\/([a-f0-9-]{36})$/i.exec(route);
  if (trialMatch && req.method === 'GET') return reply(res, 200, trials.get(trialMatch[1]));
  const approveMatch = /^\/api\/trials\/([a-f0-9-]{36})\/approve$/i.exec(route);
  if (approveMatch && req.method === 'POST') return reply(res, 200, await trials.approve(approveMatch[1]));
  const downloadMatch = /^\/api\/trials\/([a-f0-9-]{36})\/download$/i.exec(route);
  if (downloadMatch && req.method === 'GET') return reply(res, 200, media.status(downloadMatch[1], trialJobs(downloadMatch[1])));
  if (downloadMatch && req.method === 'POST') {
    const jobs = trialJobs(downloadMatch[1]);
    if (jobs.some(job => job.status !== 'complete' || !job.outputs?.length)) throw new Error('请等待本批所有视频生成完成后再统一下载');
    return reply(res, 202, media.start({ id: downloadMatch[1] }, jobs));
  }
  const archiveMatch = /^\/api\/trials\/([a-f0-9-]{36})\/archive$/i.exec(route);
  if (archiveMatch && req.method === 'GET') return await media.archive(trialJobs(archiveMatch[1]), res);
  if (route === '/api/batches' && req.method === 'POST') return reply(res, 201, queue.enqueue(planBatch(await body(req))));
  if (route === '/api/batches' && req.method === 'GET') return reply(res, 200, queue.snapshot().batches);
  if (route === '/api/jobs' && req.method === 'GET') return reply(res, 200, queue.snapshot(url.searchParams.get('batch')).jobs);
  const jobMatch = /^\/api\/jobs\/([a-f0-9-]{36})$/i.exec(route);
  if (jobMatch && req.method === 'GET') {
    const job = queue.state.jobs.find(item => item.id === jobMatch[1]);
    return job ? reply(res, 200, job) : reply(res, 404, { error: '视频任务不存在' });
  }
  const videoMatch = /^\/api\/video\/([a-f0-9-]{36})$/i.exec(route);
  if (videoMatch && req.method === 'GET') {
    const job = queue.state.jobs.find(item => item.id === videoMatch[1]);
    if (!job) return reply(res, 404, { error: '视频任务不存在' });
    return await media.serve(job, req, res, url.searchParams.has('download'));
  }
  return reply(res, 404, { error: '未找到接口' });
};

http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) return reply(res, 403, { error: '仅允许从本地工作台提交请求' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' || url.pathname !== '/') return reply(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return reply(res, 200, fs.readFileSync(path.join(root, 'index.html')), 'text/html; charset=utf-8');
  } catch (error) { return reply(res, 400, { error: error.message }); }
}).listen(port, '127.0.0.1', () => console.log(`视频生成工作台：http://127.0.0.1:${port}`));
