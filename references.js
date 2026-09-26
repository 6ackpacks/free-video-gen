import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const formats = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
export class ReferenceLibrary {
  constructor(directory, provider) {
    this.directory = directory;
    this.provider = provider;
    this.file = path.join(directory, 'references.json');
    this.assets = path.join(directory, 'reference-images');
    this.inFlight = new Map();
    fs.mkdirSync(this.assets, { recursive: true });
    this.items = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  public(item) {
    const { id, name, mime, bytes, createdAt, sceneProfile = null, analysisStatus = 'pending', analysisError = '' } = item;
    return { id, name, mime, bytes, createdAt, sceneProfile, analysisStatus, analysisError, previewUrl: `/api/references/${id}/image` };
  }
  list() { return this.items.map(item => this.public(item)); }
  get(id) { const item = this.items.find(x => x.id === id); if (!item) throw new Error('参考图不存在'); return this.public(item); }
  add(input) {
    const mime = String(input.mime || '');
    if (!formats[mime]) throw new Error('仅支持 JPG、PNG、WebP 或 GIF 图片');
    if (typeof input.base64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(input.base64)) throw new Error('图片数据无效');
    const bytes = Buffer.from(input.base64, 'base64');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('参考图大小须在 20MB 以内');
    const id = randomUUID();
    const name = String(input.name || '背景参考').trim().slice(0, 80);
    fs.writeFileSync(path.join(this.assets, id + formats[mime]), bytes);
    const item = { id, name, mime, bytes: bytes.length, createdAt: new Date().toISOString(), remoteUrl: '', expiresAt: 0, sceneProfile: null, analysisStatus: 'pending', analysisError: '' };
    this.items.unshift(item); this.save();
    return this.list()[0];
  }
  addBuffer({ name, mime, bytes, derivedFrom = '', timestamp = '' }) {
    if (!formats[mime] || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('生成图片格式或大小无效');
    const id = randomUUID();
    fs.writeFileSync(path.join(this.assets, id + formats[mime]), bytes);
    const item = { id, name: String(name || '监控底图').slice(0, 80), mime, bytes: bytes.length, createdAt: new Date().toISOString(), remoteUrl: '', expiresAt: 0, sceneProfile: null, analysisStatus: 'pending', analysisError: '', derivedFrom, timestamp };
    this.items.unshift(item); this.save(); return this.public(item);
  }
  fileFor(id) {
    const item = this.items.find(x => x.id === id);
    if (!item) throw new Error('参考图不存在');
    return { item, filename: path.join(this.assets, id + formats[item.mime]) };
  }
  async ensure(id) {
    if (!id) return '';
    const { item, filename } = this.fileFor(id);
    if (item.remoteUrl && item.expiresAt > Date.now() + 24 * 3600000) return item.remoteUrl;
    if (!this.provider?.uploadImage) throw new Error('视频 API 不支持上传参考图');
    if (!this.inFlight.has(id)) {
      const task = this.provider.uploadImage(fs.readFileSync(filename), item.name + formats[item.mime], item.mime)
        .then(url => { item.remoteUrl = url; item.expiresAt = Date.now() + 71 * 3600000; this.save(); return url; })
        .finally(() => this.inFlight.delete(id));
      this.inFlight.set(id, task);
    }
    return this.inFlight.get(id);
  }
  source(id, mode = 'remote') {
    const { item, filename } = this.fileFor(id);
    if (mode === 'data-url') return `data:${item.mime};base64,${fs.readFileSync(filename).toString('base64')}`;
    return this.ensure(id);
  }
  async analyze(id, override = null) {
    const { item } = this.fileFor(id);
    if (override) {
      item.sceneProfile = this.normalizeProfile(override);
      item.analysisStatus = 'complete'; item.analysisError = ''; this.save();
      return this.public(item);
    }
    item.analysisStatus = 'analyzing'; item.analysisError = ''; this.save();
    try {
      const remoteUrl = await this.ensure(id);
      item.sceneProfile = this.normalizeProfile(await this.provider.analyzeScene(remoteUrl));
      item.analysisStatus = 'complete'; this.save();
      return this.public(item);
    } catch (error) {
      item.analysisStatus = 'error'; item.analysisError = error.message || String(error); this.save();
      throw error;
    }
  }
  normalizeProfile(value) {
    const allowed = new Set(['corridor', 'visible_door', 'visible_card_door', 'nearby_visible_door', 'clear_walkway', 'side_area']);
    const profile = {
      spaceType: String(value?.spaceType || '').slice(0, 100),
      description: String(value?.description || '').trim().slice(0, 1200),
      fixedView: String(value?.fixedView || '').slice(0, 300),
      walkableAreas: Array.isArray(value?.walkableAreas) ? value.walkableAreas.map(x => String(x).slice(0, 200)).slice(0, 8) : [],
      doors: Array.isArray(value?.doors) ? value.doors.map(x => ({ position: String(x?.position || '').slice(0, 150), cardAccess: x?.cardAccess === true, nearby: x?.nearby === true })).slice(0, 12) : [],
      entrancesExits: Array.isArray(value?.entrancesExits) ? value.entrancesExits.map(x => String(x).slice(0, 200)).slice(0, 8) : [],
      perspective: String(value?.perspective || '').slice(0, 300),
      maxPeople: Math.max(1, Math.min(3, Number(value?.maxPeople) || 1)),
      sceneTags: Array.isArray(value?.sceneTags) ? [...new Set(value.sceneTags.filter(x => allowed.has(x)))] : []
    };
    if (!profile.description) throw new Error('场景档案缺少底图描述');
    return profile;
  }
}
