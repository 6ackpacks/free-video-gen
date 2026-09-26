// The real provider adapter is selected once the API vendor and model are supplied.
// A provider module exports createProvider({ apiKey, model }) and returns:
// { name, supportsIdempotency, submit(job), status(providerJobId), health() }.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DoubaoBridge } from './doubao.js';
import { createWanProviders } from './wan.js';
import { hasSecret } from './secrets.js';

export async function loadProvider() {
  const keyAvailable = hasSecret('VIDEO');
  const modulePath = process.env.VIDEO_PROVIDER_MODULE || (keyAvailable ? path.join(path.dirname(fileURLToPath(import.meta.url)), 'apimart.js') : '');
  let apimart = null;
  if (modulePath) {
    const { createProvider } = await import(pathToFileURL(path.resolve(modulePath)).href);
    if (typeof createProvider !== 'function') throw new Error('视频 API 适配器缺少 createProvider');
    apimart = createProvider({ apiKey: process.env.VIDEO_API_KEY || '', model: process.env.VIDEO_MODEL || '' });
  }
  const doubao = new DoubaoBridge();
  const wan = createWanProviders();
  const routes = [
    { id: 'apimart', name: 'APIMart', model: apimart?.model || 'grok-imagine-1.5-video-ext', configured: Boolean(apimart), resolutions: ['480P', '720P'], duration: { min: 6, max: 6 } },
    { id: 'wan-tokendance', name: 'TokenDance', model: 'wan3.0-video', configured: wan['wan-tokendance'].configured, resolutions: ['480P', '720P', '1080P'], duration: { min: 2, max: 30 } },
    { id: 'wan-aliyun', name: '阿里云百炼', model: 'wan3.0-video', configured: wan['wan-aliyun'].configured, resolutions: ['480P', '720P', '1080P'], duration: { min: 2, max: 30 } },
    { id: 'doubao', name: '豆包账号池', model: doubao.model, configured: true, resolutions: ['480P', '720P'], duration: { min: 5, max: 10 } }
  ];
  return {
    name: '多模型路由', model: apimart?.model || '', promptModel: apimart?.promptModel || '', sceneAnalysisModel: apimart?.sceneAnalysisModel || '', imageModel: apimart?.imageModel || '', configured: routes.some(x => x.configured), routes,
    supportsIdempotency: false, apimart, doubao,
    setReferences(value) { doubao.setReferences(value); },
    draft(job) { if (!apimart?.draft) throw new Error('Qwen 提示词 API 尚未配置'); return apimart.draft(job); },
    submit(job) { const route = job.videoRoute || job.generationMethod || 'apimart'; if (route === 'doubao') return doubao.submit(job); if (wan[route]) return wan[route].submit(job); if (!apimart) throw new Error('APIMart 尚未配置'); return apimart.submit(job); },
    status(id, job) { const route = job?.videoRoute || job?.generationMethod || 'apimart'; if (route === 'doubao') return doubao.status(id); if (wan[route]) return wan[route].status(id); if (!apimart) throw new Error('APIMart 尚未配置'); return apimart.status(id); },
    uploadImage(...args) { if (!apimart) throw new Error('APIMart 尚未配置'); return apimart.uploadImage(...args); },
    analyzeScene(...args) { if (!apimart?.analyzeScene) throw new Error('场景分析模型尚未配置'); return apimart.analyzeScene(...args); },
    submitImageTransform(...args) { if (!apimart?.submitImageTransform) throw new Error('APIMart 生图模型尚未配置'); return apimart.submitImageTransform(...args); },
    imageTransformStatus(...args) { if (!apimart?.imageTransformStatus) throw new Error('APIMart 生图模型尚未配置'); return apimart.imageTransformStatus(...args); },
    health() { return apimart?.health?.(); }
  };
}
