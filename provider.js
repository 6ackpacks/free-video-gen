import {createTokenDanceChat} from './tokendance-chat.js';
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
  const chatProvider=process.env.TEXT_PROVIDER==='tokendance'?createTokenDanceChat():null;
  if(chatProvider&&!chatProvider.configured)throw Error('已选择TokenDance，但尚未配置密钥');
  const keyAvailable = hasSecret('VIDEO');
  const modulePath = process.env.VIDEO_PROVIDER_MODULE || (keyAvailable ? path.join(path.dirname(fileURLToPath(import.meta.url)), 'apimart.js') : '');
  let apimart = null;
  if (modulePath) {
    const { createProvider } = await import(pathToFileURL(path.resolve(modulePath)).href);
    if (typeof createProvider !== 'function') throw new Error('视频 API 适配器缺少 createProvider');
    apimart = createProvider({ apiKey: process.env.VIDEO_API_KEY || '', model: process.env.VIDEO_MODEL || '', chatProvider });
  }
  let custom = null;
  const customModulePath = process.env.CUSTOM_VIDEO_PROVIDER_MODULE || '';
  if (customModulePath) {
    const { createProvider } = await import(pathToFileURL(path.resolve(customModulePath)).href);
    if (typeof createProvider !== 'function') throw new Error('自有模型适配器缺少 createProvider');
    custom = createProvider({ apiKey: process.env.CUSTOM_VIDEO_API_KEY || '', model: process.env.CUSTOM_VIDEO_MODEL || '' });
    if (typeof custom?.submit !== 'function' || typeof custom?.status !== 'function') throw new Error('自有模型适配器必须提供 submit 和 status');
  }
  let referenceLibrary;
  const doubao = new DoubaoBridge();
  const wan = createWanProviders();
  const routes = [
    { id: 'custom', name: custom?.name || '自有视频模型', model: custom?.model || process.env.CUSTOM_VIDEO_MODEL || 'custom-image-to-video', configured: Boolean(custom), referenceMode: custom?.referenceMode || 'reference-image', resolutions: custom?.resolutions || ['480P', '720P', '1080P'], duration: custom?.duration || { min: 2, max: 30 } },
    { id: 'apimart', name: 'APIMart', model: apimart?.model || 'grok-imagine-1.5-video-ext', configured: Boolean(apimart), referenceMode: 'visual-brief', resolutions: ['480P', '720P'], duration: { min: 6, max: 6 } },
    { id: 'wan-tokendance', name: 'TokenDance', model: 'wan3.0-video', configured: wan['wan-tokendance'].configured, referenceMode: 'reference-image', resolutions: ['480P', '720P', '1080P'], duration: { min: 2, max: 30 } },
    { id: 'wan-aliyun', name: '阿里云百炼', model: 'wan3.0-video', configured: wan['wan-aliyun'].configured, referenceMode: 'reference-image', resolutions: ['480P', '720P', '1080P'], duration: { min: 2, max: 30 } },
    { id: 'doubao', name: '豆包账号池', model: doubao.model, configured: true, referenceMode: 'reference-image', resolutions: ['由豆包决定'], duration: { min: 5, max: 15, values: [5, 10, 15] } }
  ];
  return {
    name: '多模型路由', model: custom?.model || apimart?.model || '', textProvider:chatProvider?.name||'APIMart', promptModel: apimart?.promptModel || '', sceneAnalysisModel: apimart?.sceneAnalysisModel || '', imageModel: custom?.imageModel || apimart?.imageModel || '', keyframeConfigured: Boolean(custom?.submitKeyframe && custom?.keyframeStatus || apimart?.submitKeyframe && apimart?.keyframeStatus), configured: routes.some(x => x.configured), routes,
    supportsIdempotency: false, custom, apimart, doubao,
    setReferences(value) { referenceLibrary = value; doubao.setReferences(value); },
    draft(job) { if (!apimart?.draft) throw new Error('Qwen 提示词 API 尚未配置'); return apimart.draft(job); },
    rewritePrompts(input) { if(custom?.rewritePrompts)return custom.rewritePrompts(input);if(apimart?.rewritePrompts)return apimart.rewritePrompts(input);throw Error('提示词大模型尚未配置'); },
    draftKeyframePrompts(...args) { if (custom?.draftKeyframePrompts) return custom.draftKeyframePrompts(...args); if (apimart?.draftKeyframePrompts) return apimart.draftKeyframePrompts(...args); throw new Error('提示词大模型尚未配置'); },
    draftStoryPrompts(...args) { if (custom?.draftStoryPrompts) return custom.draftStoryPrompts(...args); if (apimart?.draftStoryPrompts) return apimart.draftStoryPrompts(...args); throw new Error('短剧提示词大模型尚未配置'); },
    analyzeReplica(input) { if(custom?.analyzeReplica)return custom.analyzeReplica(input);if(apimart?.analyzeReplica)return apimart.analyzeReplica(input);throw Error('尚未配置视频分析模型'); },
    async submit(job) { const route = job.videoRoute || job.generationMethod || 'apimart'; if (route === 'custom') { if (!custom) throw new Error('自有视频模型尚未配置'); return custom.submit(job); } if (route === 'doubao') return doubao.submit(job); if (wan[route]) { if (job.referenceImageIds?.length) { if (!referenceLibrary) throw Error('参考图库未就绪'); const urls=[]; for (const id of job.referenceImageIds) urls.push(await referenceLibrary.ensure(id)); job = { ...job, referenceImageUrls: urls, referenceImageUrl: urls[0] }; } return wan[route].submit(job); } if (!apimart) throw new Error('APIMart 尚未配置'); return apimart.submit(job); },
    status(id, job) { const route = job?.videoRoute || job?.generationMethod || 'apimart'; if (route === 'custom') { if (!custom) throw new Error('自有视频模型尚未配置'); return custom.status(id, job); } if (route === 'doubao') return doubao.status(id); if (wan[route]) return wan[route].status(id); if (!apimart) throw new Error('APIMart 尚未配置'); return apimart.status(id); },
    uploadImage(...args) { if (!apimart) throw new Error('APIMart 尚未配置'); return apimart.uploadImage(...args); },
    analyzeScene(...args) { if (!apimart?.analyzeScene) throw new Error('场景分析模型尚未配置'); return apimart.analyzeScene(...args); },
    submitImageTransform(...args) { if (!apimart?.submitImageTransform) throw new Error('APIMart 生图模型尚未配置'); return apimart.submitImageTransform(...args); },
    imageTransformStatus(...args) { if (!apimart?.imageTransformStatus) throw new Error('APIMart 生图模型尚未配置'); return apimart.imageTransformStatus(...args); },
    submitKeyframe(...args) { if (custom?.submitKeyframe) return custom.submitKeyframe(...args); if (apimart?.submitKeyframe) return apimart.submitKeyframe(...args); throw new Error('首帧图片模型尚未配置'); },
    keyframeStatus(...args) { if (custom?.keyframeStatus) return custom.keyframeStatus(...args); if (apimart?.keyframeStatus) return apimart.keyframeStatus(...args); throw new Error('首帧图片模型尚未配置'); },
    health() { return apimart?.health?.(); }
  };
}
