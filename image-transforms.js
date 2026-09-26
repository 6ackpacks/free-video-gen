import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const IMAGE_PROMPT = timestamp => `把参考图加工为真实实拍的老旧监控摄像头画面。严格保留原图中的空间、人物、物件、门、通道与装饰，不增加、不删除、不替换场景内容。只改变拍摄机位、透视与成像质感：摄像头固定安装在靠近天花板的高处角落，以约 45 度较大俯角向下拍摄；使用老式轻微广角监控镜头，形成明显纵深透视和轻微广角畸变。画面轻微模糊，灰蒙蒙一层雾感，低饱和、低对比，带自然噪点、压缩痕迹和轻微曝光不完美，保持彩色、真实实拍感，不要电影感。左上角加入略有老旧感的白色监控时间文字：“${timestamp}”“通道01”。时间文字清晰但不过度醒目。`;

export class ImageTransformManager {
  constructor(directory, provider, references) {
    this.file = path.join(directory, 'image-transforms.json'); this.provider = provider; this.references = references;
    this.items = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  save() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  list() { return this.items.slice(0, 50); }
  get(id) { const item = this.items.find(x => x.id === id); if (!item) throw new Error('生图任务不存在'); return item; }
  timestamp() {
    const used = new Set(this.items.map(x => x.timestamp));
    for (let i = 0; i < 500; i++) {
      const date = new Date(Date.now() - Math.floor(Math.random() * 90 * 86400000) - Math.floor(Math.random() * 86400000));
      const hour = 18 + Math.floor(Math.random() * 6), minute = Math.floor(Math.random() * 60);
      const value = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 PM ${String(hour > 12 ? hour - 12 : hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      if (!used.has(value)) return value;
    }
    return `${new Date().toISOString()} PM`;
  }
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
        const ref = this.references.addBuffer({ name: `监控底图 ${item.timestamp}`, mime: ['image/jpeg', 'image/png', 'image/webp'].includes(mime) ? mime : 'image/png', bytes, derivedFrom: item.referenceId, timestamp: item.timestamp });
        item.resultReferenceId = ref.id;
        try { await this.references.analyze(ref.id); } catch (error) { item.analysisError = error.message || String(error); }
      } catch (error) { item.status = 'error'; item.error = error.message || String(error); }
    }
    this.save(); return item;
  }
}

export { IMAGE_PROMPT };
