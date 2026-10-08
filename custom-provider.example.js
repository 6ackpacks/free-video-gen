// Adapt these methods to the user's own image/video model API, then set
// CUSTOM_VIDEO_PROVIDER_MODULE=./custom-provider.js in project.env.local.
// Do not store a real API key in this source file.
export function createProvider({ apiKey, model }) {
  const baseUrl = process.env.CUSTOM_VIDEO_BASE_URL || '';
  const request = async (route, options = {}) => {
    const response = await fetch(baseUrl + route, { ...options, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `自有模型 HTTP ${response.status}`);
    return data;
  };
  return {
    name: '自有图像与视频模型', model: model || 'your-image-to-video-model', imageModel: process.env.CUSTOM_IMAGE_MODEL || 'your-image-model',
    resolutions: ['480P', '720P', '1080P'], duration: { min: 2, max: 30 },
    async submitKeyframe(prompt) {
      const data = await request('/images/generations', { method: 'POST', body: JSON.stringify({ model: process.env.CUSTOM_IMAGE_MODEL, prompt, aspect_ratio: '9:16' }) });
      return { id: data.id, status: 'waiting' };
    },
    async keyframeStatus(id) {
      const data = await request(`/images/tasks/${encodeURIComponent(id)}`);
      return { status: { queued: 'waiting', processing: 'running', succeeded: 'complete', failed: 'error' }[data.status] || 'waiting', url: data.image_url || '', error: data.error || '' };
    },
    async submit(job) {
      const data = await request('/videos/generations', { method: 'POST', body: JSON.stringify({ model: job.videoModel || model, image: job.referenceImageUrl, prompt: job.prompt, duration: job.duration, resolution: job.resolution, aspect_ratio: job.ratio, seed: job.seed }) });
      return { id: data.id, status: 'waiting', outputs: [] };
    },
    async status(id) {
      const data = await request(`/videos/tasks/${encodeURIComponent(id)}`);
      return { status: { queued: 'waiting', processing: 'running', succeeded: 'complete', failed: 'error' }[data.status] || 'waiting', outputs: data.video_url ? [{ url: data.video_url }] : [], error: data.error || '' };
    }
  };
}
