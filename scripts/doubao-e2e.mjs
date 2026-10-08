const base = process.env.WORKBENCH_URL || 'http://127.0.0.1:4192';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const api = async (route, options = {}) => {
  const response = await fetch(base + '/api' + route, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  return data;
};
const post = (route, value) => api(route, { method: 'POST', body: JSON.stringify(value) });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

console.log('[1/3] 正在生成 3 条独立提示词…');
const prompts = await post('/keyframe-prompt-batches', {
  count: 3, sceneMode: 'mixed', focusMode: 'mixed', footMode: 'mixed', variantKey: `doubao-e2e-${stamp}`,
  imagePrompt: '整批需要三位不同的成年女性技师，每条提示词只生成其中一位；每张图必须是单场景单人照片，严禁拼图、分镜和多画面。真实中国家庭随手拍质感，整批的人物、穿搭和家庭细节明显不同。'
});
console.log(`PROMPTS_READY ${prompts.items.map(item => item.id).join(',')}`);

console.log('[2/3] 正在基于提示词生成 3 张图片…');
let imageBatch = await post('/keyframe-batches', {
  count: 3, sceneMode: 'mixed', focusMode: 'mixed', footMode: 'mixed', variantKey: `doubao-e2e-${stamp}`, items: prompts.items
});
console.log(`IMAGE_BATCH ${imageBatch.id}`);
for (;;) {
  await wait(5000);
  imageBatch = await api(`/keyframe-batches/${imageBatch.id}`);
  console.log(`IMAGES ${imageBatch.progress.complete}/${imageBatch.progress.total} active=${imageBatch.progress.active} errors=${imageBatch.progress.errors}`);
  if (imageBatch.progress.errors) throw new Error(imageBatch.items.find(item => item.error)?.error || '图片生成失败');
  if (imageBatch.progress.complete === 3) break;
}

console.log('[3/3] 正在把 3 张图片分发给 3 个豆包账号生成视频…');
const confirmed = await post(`/keyframe-batches/${imageBatch.id}/confirm`, {
  itemIds: imageBatch.items.map(item => item.id), itemDirections: {}, batchVideoPrompt: '',
  referenceMode: 'reference-image', videoRoute: 'doubao', videoModel: 'seedance_v2.0_mini', duration: 5, resolution: '由豆包决定'
});
const videoBatchId = confirmed.videoBatch.id;
console.log(`VIDEO_BATCH ${videoBatchId}`);
for (;;) {
  await wait(5000);
  const jobs = await api(`/jobs?batch=${encodeURIComponent(videoBatchId)}`);
  const complete = jobs.filter(job => job.status === 'complete' && job.outputs?.length).length;
  const failed = jobs.filter(job => ['error', 'needs_review'].includes(job.status));
  console.log(`VIDEOS ${complete}/${jobs.length} ${jobs.map(job => `${job.index}:${job.status}`).join(' ')}`);
  if (failed.length) throw new Error(failed.map(job => `#${job.index} ${job.error}`).join('; '));
  if (complete === 3) {
    console.log(JSON.stringify({ ok: true, promptIds: prompts.items.map(item => item.id), imageBatchId: imageBatch.id, imageReferenceIds: imageBatch.items.map(item => item.resultReferenceId), videoBatchId, videos: jobs.map(job => ({ index: job.index, jobId: job.id, preview: `${base}/api/video/${job.id}`, download: `${base}/api/video/${job.id}?download=1` })) }, null, 2));
    break;
  }
}
