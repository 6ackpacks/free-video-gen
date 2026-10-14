import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MONITOR_CAMERA_STYLE = `只改变拍摄机位、透视与成像质感：摄像头固定安装在靠近天花板的高处角落，以约 45 度较大俯角向下拍摄；使用老式轻微广角监控镜头，形成明显纵深透视和轻微广角畸变。画面轻微模糊，灰蒙蒙一层雾感，低饱和、低对比，带自然噪点、压缩痕迹和轻微曝光不完美，保持彩色、真实实拍感，不要电影感。`;
export const MONITOR_TIME_TEXT = '左上角加入略有老旧感的白色 CCTV 时间：“2026年9月9日 PM 10:41”“通道01”。文字清楚且稳定，不添加宣传字幕或监控屏幕外框。';
export function monitorVideoRules(text){const body=String(text||'');return body+(body.includes(MONITOR_CAMERA_STYLE)&&body.includes(MONITOR_TIME_TEXT)?'':'\n'+MONITOR_CAMERA_STYLE+MONITOR_TIME_TEXT)+'\n固定要求优先：摄像头全程静止，不推拉、不跟拍、不切换机位。锁定对应底图的人物、面容与服装，不换人；时间和通道文字保持稳定。';}

const IMAGE_PROMPT = timestamp => `把参考图加工为真实实拍的老旧监控摄像头画面。严格保留原图中的空间、人物、物件、门、通道与装饰，不增加、不删除、不替换场景内容。${MONITOR_CAMERA_STYLE}${MONITOR_TIME_TEXT}`;

export class ImageTransformManager {
  constructor(directory, provider, references) {
    this.file = path.join(directory, 'image-transforms.json'); this.provider = provider; this.references = references;
    this.items = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  save() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  list() { return this.items.slice(0, 50); }
  get(id) { const item = this.items.find(x => x.id === id); if (!item) throw new Error('生图任务不存在'); return item; }
  timestamp() { return '2026年9月9日 PM 10:41'; }
  async create(referenceId) {
    const timestamp = this.timestamp();
    const imageUrl = await this.references.ensure(referenceId);
    const submitted = await this.provider.submitImageTransform(imageUrl, IMAGE_PROMPT(timestamp));
    const item = { id: randomUUID(), providerId: submitted.id, referenceId, timestamp, prompt: IMAGE_PROMPT(timestamp), status: 'waiting', resultReferenceId: '', error: '', createdAt: new Date().toISOString() };
    this.items.unshift(item); this.save(); return item;
  }
  async refresh(id) {
    const item = this.get(id);
    if (['complete', 'error'].includes(item.status)) return item;
    const state = await this.provider.imageTransformStatus(item.providerId);
    item.status = state.status; item.error = state.error || '';
    if (state.status === 'complete' && state.url && !item.resultReferenceId) {
      try {
        const response = await fetch(state.url, { signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`生成图片下载失败：HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const mime = String(response.headers.get('content-type') || 'image/png').split(';')[0];
        const ref = this.references.addBuffer({ name: `监控底图 ${item.timestamp}`, mime: ['image/jpeg', 'image/png', 'image/webp'].includes(mime) ? mime : 'image/png', bytes, derivedFrom: item.referenceId, timestamp: item.timestamp, purpose: 'store-background' });
        item.resultReferenceId = ref.id;
        try { await this.references.analyze(ref.id); } catch (error) { item.analysisError = error.message || String(error); }
      } catch (error) { item.status = 'error'; item.error = error.message || String(error); }
    }
    this.save(); return item;
  }
}

export { IMAGE_PROMPT };
