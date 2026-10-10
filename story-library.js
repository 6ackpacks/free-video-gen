import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const catalog = JSON.parse(fs.readFileSync(new URL('./story-template-catalog.json', import.meta.url), 'utf8'));
export const STORY_STRATEGIES = catalog.strategies;
export const STORY_TEMPLATES = catalog.templates;

export class StoryLibrary {
  constructor(file) { this.file = file; this.subjects = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []; }
  list() { return this.subjects; }
  get(id) { const subject = this.subjects.find(s => s.id === id); if (!subject) throw Error('宣传主体不存在，请重新选择'); return subject; }
  save(input, id) {
    const name = String(input.name || '').trim(), materials = String(input.materials || '').trim();
    if (!name || name.length > 80) throw Error('主体名称须为 1–80 个字符');
    if (!materials || materials.length > 30000) throw Error('宣传资料须为 1–30000 个字符');
    const subject = id ? this.get(id) : { id: randomUUID(), createdAt: new Date().toISOString() };
    const assets = input.assets === undefined ? (subject.assets || []) : input.assets;
    if (!Array.isArray(assets) || assets.length > 20) throw Error('每个主体最多保存20张参考图');
    const cleanedAssets = assets.map(asset => {
      if (!/^[a-f0-9-]{36}$/i.test(String(asset.referenceId || ''))) throw Error('参考图编号无效');
      return { referenceId: asset.referenceId, name: String(asset.name || '商品参考').slice(0,80), role: String(asset.role || '商品外观').slice(0,100) };
    });
    Object.assign(subject, { name, materials, assets: cleanedAssets, updatedAt: new Date().toISOString() });
    if (!id) this.subjects.unshift(subject);
    this.persist(); return subject;
  }
  delete(id) { this.get(id); this.subjects = this.subjects.filter(s => s.id !== id); this.persist(); }
  persist() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.subjects, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  resolve(input) {
    const subject = this.get(input.subjectId);
    const ids = [...new Set(Array.isArray(input.templateIds) ? input.templateIds : [input.templateId])];
    const templates = ids.map(id => STORY_TEMPLATES.find(t => t.id === id));
    if (!templates.length || templates.some(t => !t)) throw Error('请选择已接入的短句模板');
    const requestedIds = [...new Set(Array.isArray(input.referenceImageIds) ? input.referenceImageIds : [])];
    if (requestedIds.length > 3) throw Error('本次最多选择3张外观参考图');
    const selectedAssets = requestedIds.map(id => (subject.assets || []).find(a => a.referenceId === id));
    if (selectedAssets.some(a => !a)) throw Error('参考图片不属于当前主体，请重新选择');
    if (!['text-only', 'reference-image', undefined].includes(input.referenceMode)) throw Error('请选择文生视频或外观参考图模式');
    if (input.referenceMode === 'reference-image' && !selectedAssets.length) throw Error('请勾选至少一张商品或门店参考图');
    return { ...input, referenceMode: input.referenceMode || 'text-only', referenceImageIds: input.referenceMode === 'reference-image' ? requestedIds : [], selectedAssets: input.referenceMode === 'reference-image' ? selectedAssets : [], brandName: subject.name, brief: subject.materials, templates: templates.map(t => ({ ...t })), template: { ...templates[0] }, sceneId: templates[0].sceneId };
  }
}
