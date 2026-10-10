import { randomUUID } from 'node:crypto';

const allowedRoutes = new Set(['custom', 'apimart', 'wan-tokendance', 'wan-aliyun', 'doubao']);
const normalizeVideoSeed = value => Number.isInteger(value) && value >= 0
  ? value % 2147483648
  : Math.floor(Math.random() * 2147483648);

export async function planPairedVideoJobs(input, references) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.length > 500) throw new Error('一图一视频批次须包含 1–500 张已确认首帧');
  const videoRoute = allowedRoutes.has(input.videoRoute) ? input.videoRoute : 'apimart';
  const videoModel = String(input.videoModel || '').trim();
  const duration = Math.max(2, Math.min(15, Math.round(Number(input.duration) || 5)));
  const resolution = ['480P', '720P', '1080P'].includes(String(input.resolution || '').toUpperCase()) ? String(input.resolution).toUpperCase() : '480P';
  const seen = new Set();
  const jobs = [];
  for (let offset = 0; offset < items.length; offset++) {
    const item = items[offset] || {};
    const referenceId = String(item.referenceId || '').trim();
    if (!referenceId) throw new Error(`第 ${offset + 1} 条缺少 referenceId`);
    if (seen.has(referenceId)) throw new Error(`同一张首帧只能生成一个视频：${referenceId}`);
    seen.add(referenceId); references.get(referenceId);
    const prompt = String(item.videoPrompt || input.videoPrompt || '').trim().slice(0, 6000);
    if (!prompt) throw new Error(`第 ${offset + 1} 条缺少视频提示词`);
    const requestedMode = item.referenceMode === 'first-frame' ? 'first-frame' : 'reference-image';
    const supportsReferenceImage = videoRoute.startsWith('wan-') || videoRoute === 'custom' || videoRoute === 'doubao';
    const referenceMode = requestedMode === 'first-frame' ? 'first-frame' : (supportsReferenceImage ? 'reference-image' : 'visual-brief');
    const referenceImageUrl = referenceMode === 'reference-image' || referenceMode === 'first-frame'
      ? (videoRoute.startsWith('wan-') || videoRoute === 'custom' ? references.source(referenceId, 'data-url') : (videoRoute === 'apimart' ? await references.ensure(referenceId) : ''))
      : '';
    jobs.push({
      id: randomUUID(), index: offset + 1, pairId: String(item.pairId || '').trim() || randomUUID(),
      skillId: String(input.templateId || 'paired-image-to-video'), skillName: String(input.templateName || '一图一视频'),
      prompt, promptSections: { sourceImage: `参考图 ${referenceId}`, lockedAction: prompt }, lockedPrompt: true,
      referenceId, referenceImageUrl, referenceMode, generationMethod: videoRoute === 'doubao' ? 'doubao' : 'apimart',
      videoRoute, videoModel, duration, resolution, ratio: '9:16', seed: normalizeVideoSeed(item.seed),
      outputs: [], characters: [], choices: { ...(item.variation || {}), promptVersion: item.promptVersion || 'legacy', camera: item.camera || null, motion: item.motion || null, userDirection: item.userDirection || '' }
    });
  }
  return jobs;
}
