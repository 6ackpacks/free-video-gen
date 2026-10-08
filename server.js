import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSkills, saveSkill, planBatch } from './skills.js';
import { loadProvider } from './provider.js';
import { VideoQueue } from './queue.js';
import { ReferenceLibrary } from './references.js';
import { TrialManager, buildFixedMassagePrompt } from './trials.js';
import { MediaStore } from './media.js';
import { loadActionTemplates, templatesWithCompatibility } from './action-templates.js';
import { compilePrompt, makeCharacters, selectTemplate } from './prompt-compiler.js';
import { ImageTransformManager } from './image-transforms.js';
import { planPromptPairs, YIQU_TEMPLATE } from './paired-prompts.js';
import { KeyframeBatchManager } from './keyframe-batches.js';
import { draftKeyframePromptBatch } from './prompt-batches.js';
import { configureNetwork } from './network.js';
import { ensureDoubaoManager } from './manager-runtime.js';
import { contentPackActionDirectory, getContentPack, listContentPacks } from './content-packs.js';
import { draftStoryPromptBatch, planStoryVideoJobs } from './story-prompts.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
configureNetwork();
try {
  await ensureDoubaoManager({ root, logger: message => console.log(`[豆包] ${message}`) });
} catch (error) {
  console.warn(`[豆包] 内置服务暂不可用：${error.message}`);
}
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
const keyframeBatches = new KeyframeBatchManager(path.join(root, 'data', 'keyframe-batches.json'), provider, references, queue, {
  maxSubmits: process.env.IMAGE_MAX_SUBMITS,
  maxPolls: process.env.IMAGE_MAX_POLLS
});
const trialJobs = id => {
  const trial = trials.get(id);
  return queue.state.jobs.filter(job => job.batchId === trial.trialBatchId || (trial.bulkBatchId && job.batchId === trial.bulkBatchId)).sort((a, b) => a.index - b.index);
};
const batchJobs = id => queue.state.jobs.filter(job => job.batchId === id).sort((a, b) => a.index - b.index);
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
    configured: !!provider?.configured, name: provider?.name || '', model: provider?.model || '', promptModel: provider?.promptModel || '', sceneAnalysisModel: provider?.sceneAnalysisModel || '', imageModel: provider?.imageModel || '', keyframeConfigured: !!provider?.keyframeConfigured, routes: provider?.routes || [],
    maxSubmits: queue.maxSubmits, maxDrafts: queue.maxDrafts, maxPolls: queue.maxPolls, submitsPerMinute: queue.submitsPerMinute
  });
  if (route === '/api/content-packs' && req.method === 'GET') return reply(res, 200, listContentPacks());
  if (route === '/api/health' && req.method === 'GET') {
    if (!provider) return reply(res, 200, { connected: false, error: '尚未配置视频 API' });
    try { return reply(res, 200, { connected: true, provider: await provider.health?.() || provider.name }); }
    catch (error) { return reply(res, 200, { connected: false, error: error.message }); }
  }
  if (route === '/api/doubao' && req.method === 'GET') return reply(res, 200, await provider.doubao.info());
  if (route === '/api/doubao/accounts' && req.method === 'GET') return reply(res, 200, await provider.doubao.accounts());
  if (route === '/api/doubao/import-session' && req.method === 'POST') return reply(res, 201, await provider.doubao.importSession(await body(req)));
  if (route === '/api/doubao/login-attempts' && req.method === 'POST') return reply(res, 202, await provider.doubao.startLogin());
  const doubaoLoginMatch = /^\/api\/doubao\/login-attempts\/([a-f0-9-]{36})$/i.exec(route);
  if (doubaoLoginMatch && req.method === 'GET') return reply(res, 200, await provider.doubao.loginStatus(doubaoLoginMatch[1]));
  const doubaoAccountMatch = /^\/api\/doubao\/accounts\/([a-f0-9-]{36})$/i.exec(route);
  if (doubaoAccountMatch && req.method === 'PATCH') return reply(res, 200, await provider.doubao.updateAccount(doubaoAccountMatch[1], await body(req)));
  if (doubaoAccountMatch && req.method === 'DELETE') { await provider.doubao.deleteAccount(doubaoAccountMatch[1]); return reply(res, 200, { ok: true }); }
  if (route === '/api/doubao/settings' && req.method === 'GET') return reply(res, 200, await provider.doubao.settings());
  if (route === '/api/doubao/settings' && req.method === 'PUT') return reply(res, 200, await provider.doubao.updateSettings(await body(req)));
  if (route === '/api/skills' && req.method === 'GET') return reply(res, 200, listSkills());
  if (route === '/api/skills' && req.method === 'POST') return reply(res, 201, saveSkill(await body(req)));
  if (route === '/api/pair-plans' && req.method === 'POST') {
    const input = await body(req);
    return reply(res, 200, { template: YIQU_TEMPLATE, pairs: planPromptPairs(input) });
  }
  if (route === '/api/fixed-massage-preview' && req.method === 'POST') {
    const input = await body(req);
    return reply(res, 200, { prompt: buildFixedMassagePrompt(input) });
  }
  if (route === '/api/keyframe-prompt-batches' && req.method === 'POST') {
    return reply(res, 200, await draftKeyframePromptBatch(await body(req), provider));
  }
  if (route === '/api/story-prompt-batches' && req.method === 'POST') return reply(res, 200, await draftStoryPromptBatch(await body(req), provider));
  if (route === '/api/story-video-batches' && req.method === 'POST') {
    const input = await body(req);
    const routeInfo = provider.routes?.find(item => item.id === input.videoRoute);
    if (!routeInfo) throw new Error('视频模型路由不存在');
    const planned = planStoryVideoJobs(input, routeInfo);
    return reply(res, 201, queue.enqueue(planned));
  }
  if (route === '/api/keyframe-batches' && req.method === 'GET') return reply(res, 200, keyframeBatches.list());
  if (route === '/api/keyframe-batches' && req.method === 'POST') return reply(res, 201, keyframeBatches.create(await body(req)));
  const keyframeMatch = /^\/api\/keyframe-batches\/([a-f0-9-]{36})$/i.exec(route);
  if (keyframeMatch && req.method === 'GET') return reply(res, 200, await keyframeBatches.refresh(keyframeMatch[1]));
  const regenerateMatch = /^\/api\/keyframe-batches\/([a-f0-9-]{36})\/regenerate$/i.exec(route);
  if (regenerateMatch && req.method === 'POST') {
    const input = await body(req); return reply(res, 200, keyframeBatches.regenerate(regenerateMatch[1], input.itemIds));
  }
  const confirmKeyframeMatch = /^\/api\/keyframe-batches\/([a-f0-9-]{36})\/confirm$/i.exec(route);
  if (confirmKeyframeMatch && req.method === 'POST') {
    const input = await body(req); const requestedRoute = input.videoRoute || 'apimart';
    const routeInfo = provider.routes?.find(item => item.id === requestedRoute);
    if (!routeInfo) throw new Error('视频模型路由不存在');
    if (requestedRoute === 'doubao' && !(await provider.doubao.info()).ready) throw new Error('豆包管理器未就绪，请先启动并登录账号');
    if (requestedRoute !== 'doubao' && !routeInfo.configured) throw new Error(`${routeInfo.name} 尚未配置`);
    if (requestedRoute === 'doubao') await provider.doubao.prepareBatch(Array.isArray(input.itemIds) ? input.itemIds.length : 1);
    return reply(res, 201, await keyframeBatches.confirm(confirmKeyframeMatch[1], input));
  }
  const skillMatch = /^\/api\/skills\/([a-f0-9-]{36})$/i.exec(route);
  if (skillMatch && req.method === 'PUT') {
    if (!listSkills().some(skill => skill.id === skillMatch[1])) return reply(res, 404, { error: 'skill 不存在' });
    return reply(res, 200, saveSkill(await body(req), skillMatch[1]));
  }
  if (route === '/api/plan' && req.method === 'POST') return reply(res, 200, planBatch(await body(req)));
  if (route === '/api/actions' && req.method === 'GET') {
    const referenceId = url.searchParams.get('referenceId') || '';
    const pack = getContentPack(url.searchParams.get('packId') || 'foot-spa-store');
    if (pack.engine !== 'background-variants') throw new Error('当前内容模板没有固定底图动作库');
    const directory = contentPackActionDirectory(pack);
    const options = { expectedCount: pack.expectedActionCount };
    const sceneProfile = referenceId ? references.get(referenceId).sceneProfile : null;
    return reply(res, 200, sceneProfile ? templatesWithCompatibility(sceneProfile, directory, options) : loadActionTemplates(directory, options).map(item => ({ ...item, compatibility: { compatible: false, reasons: ['请先固定并分析底图'] } })));
  }
  if (route === '/api/references' && req.method === 'GET') return reply(res, 200, references.list(url.searchParams.get('scope') || ''));
  if (route === '/api/references' && req.method === 'POST') return reply(res, 201, references.add(await body(req, 29_000_000)));
  const referenceMatch = /^\/api\/references\/([a-f0-9-]{36})$/i.exec(route);
  if (referenceMatch && req.method === 'DELETE') return reply(res, 200, { deleted: references.remove(referenceMatch[1]) });
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
    const pack = getContentPack(String(input.packId || 'foot-spa-store'));
    if (pack.engine !== 'background-variants') throw new Error('当前内容模板没有固定底图动作库');
    const reference = references.get(previewMatch[1]);
    if (!reference.sceneProfile) throw new Error('请先完成底图场景分析');
    const templates = templatesWithCompatibility(reference.sceneProfile, contentPackActionDirectory(pack), { expectedCount: pack.expectedActionCount });
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
  if (approveMatch && req.method === 'POST') {
    const trial = trials.get(approveMatch[1]);
    if (trial.videoRoute === 'doubao') await provider.doubao.prepareBatch(Math.max(1, Number(trial.count) - 1));
    return reply(res, 200, await trials.approve(approveMatch[1]));
  }
  const downloadMatch = /^\/api\/trials\/([a-f0-9-]{36})\/download$/i.exec(route);
  if (downloadMatch && req.method === 'GET') return reply(res, 200, media.status(downloadMatch[1], trialJobs(downloadMatch[1])));
  if (downloadMatch && req.method === 'POST') {
    const jobs = trialJobs(downloadMatch[1]);
    if (jobs.some(job => job.status !== 'complete' || !job.outputs?.length)) throw new Error('请等待本批所有视频生成完成后再统一下载');
    return reply(res, 202, media.start({ id: downloadMatch[1] }, jobs));
  }
  const archiveMatch = /^\/api\/trials\/([a-f0-9-]{36})\/archive$/i.exec(route);
  if (archiveMatch && req.method === 'GET') return await media.archive(trialJobs(archiveMatch[1]), res);
  if (route === '/api/batches' && req.method === 'POST') {
    const input = await body(req); const planned = planBatch(input);
    if (input.videoRoute === 'doubao' || input.generationMethod === 'doubao') await provider.doubao.prepareBatch(planned.length);
    return reply(res, 201, queue.enqueue(planned));
  }
  if (route === '/api/batches' && req.method === 'GET') return reply(res, 200, queue.snapshot().batches);
  const batchDownloadMatch = /^\/api\/batches\/([a-f0-9-]{36})\/download$/i.exec(route);
  if (batchDownloadMatch && req.method === 'GET') {
    const jobs = batchJobs(batchDownloadMatch[1]);
    if (!jobs.length) return reply(res, 404, { error: '视频批次不存在' });
    return reply(res, 200, media.status(batchDownloadMatch[1], jobs));
  }
  if (batchDownloadMatch && req.method === 'POST') {
    const jobs = batchJobs(batchDownloadMatch[1]);
    if (!jobs.length) return reply(res, 404, { error: '视频批次不存在' });
    const completed = jobs.filter(job => job.status === 'complete' && job.outputs?.length);
    if (!completed.length) throw new Error('当前批次还没有可下载的视频');
    return reply(res, 202, media.start({ id: batchDownloadMatch[1] }, completed));
  }
  const batchArchiveMatch = /^\/api\/batches\/([a-f0-9-]{36})\/archive$/i.exec(route);
  if (batchArchiveMatch && req.method === 'GET') {
    const jobs = batchJobs(batchArchiveMatch[1]);
    if (!jobs.length) return reply(res, 404, { error: '视频批次不存在' });
    return await media.archive(media.runJobs(batchArchiveMatch[1], jobs), res, `videos-${batchArchiveMatch[1].slice(0, 8)}.zip`);
  }
  if (route === '/api/jobs' && req.method === 'GET') return reply(res, 200, queue.snapshot(url.searchParams.get('batch')).jobs);
  const jobMatch = /^\/api\/jobs\/([a-f0-9-]{36})$/i.exec(route);
  if (jobMatch && req.method === 'GET') {
    const job = queue.state.jobs.find(item => item.id === jobMatch[1]);
    return job ? reply(res, 200, job) : reply(res, 404, { error: '视频任务不存在' });
  }
  const retryJobMatch = /^\/api\/jobs\/([a-f0-9-]{36})\/retry$/i.exec(route);
  if (retryJobMatch && req.method === 'POST') return reply(res, 202, queue.retry(retryJobMatch[1]));
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
    if (req.method === 'GET' && url.pathname === '/legacy' && url.searchParams.get('tab') === 'accounts') return reply(res, 200, fs.readFileSync(path.join(root, 'index.html')), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/legacy') { res.writeHead(302, { Location: '/?mode=store', 'Cache-Control': 'no-store' }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/story') return reply(res, 200, fs.readFileSync(path.join(root, 'story-studio.html')), 'text/html; charset=utf-8');
    if (req.method !== 'GET' || url.pathname !== '/') return reply(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const mode = url.searchParams.get('mode');
    if (mode === 'store' || mode === 'fixed') return reply(res, 200, fs.readFileSync(path.join(root, 'index.html')), 'text/html; charset=utf-8');
    return reply(res, 200, fs.readFileSync(path.join(root, 'batch-studio.html')), 'text/html; charset=utf-8');
  } catch (error) { return reply(res, 400, { error: error.message }); }
}).listen(port, '127.0.0.1', () => console.log(`视频生成工作台：http://127.0.0.1:${port}`));
