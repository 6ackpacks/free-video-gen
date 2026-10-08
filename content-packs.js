import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const contentPackDirectory = path.join(root, 'content-packs');
export const CONTENT_ENGINES = new Set(['background-variants', 'reference-pairs', 'timeline-story']);

const validId = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));

export function validateContentPack(pack, source = 'pack.json') {
  if (!pack || typeof pack !== 'object') throw new Error(`${source} 不是有效对象`);
  if (pack.schemaVersion !== 1) throw new Error(`${source} 的 schemaVersion 必须为 1`);
  if (!validId(pack.id)) throw new Error(`${source} 的 id 必须为小写短横线格式`);
  if (!String(pack.name || '').trim()) throw new Error(`${source} 缺少 name`);
  if (!CONTENT_ENGINES.has(pack.engine)) throw new Error(`${source} 的 engine 不受支持：${pack.engine}`);
  if (!Array.isArray(pack.scenes) || !pack.scenes.length) throw new Error(`${source} 至少需要一个 scene`);
  const sceneIds = pack.scenes.map(scene => scene?.id);
  if (sceneIds.some(id => !validId(id)) || new Set(sceneIds).size !== sceneIds.length) throw new Error(`${source} 的 scene id 无效或重复`);
  if (!pack.actionLibrary && (!Array.isArray(pack.actions) || !pack.actions.length)) throw new Error(`${source} 必须提供 actionLibrary 或 actions`);
  return pack;
}

export function listContentPacks(directory = contentPackDirectory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
    .map(entry => {
      const filename = path.join(directory, entry.name, 'pack.json');
      if (!fs.existsSync(filename)) throw new Error(`内容模板缺少 pack.json：${entry.name}`);
      const pack = validateContentPack(JSON.parse(fs.readFileSync(filename, 'utf8')), filename);
      return { ...pack, source: path.relative(root, filename) };
    })
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999) || a.name.localeCompare(b.name, 'zh-CN'));
}

export function getContentPack(id, directory = contentPackDirectory) {
  const pack = listContentPacks(directory).find(item => item.id === id);
  if (!pack) throw new Error(`内容模板不存在：${id}`);
  return pack;
}

export function contentPackActionDirectory(pack, projectRoot = root) {
  if (!pack?.actionLibrary) throw new Error(`${pack?.id || '内容模板'} 没有动作模板目录`);
  const resolved = path.resolve(projectRoot, pack.actionLibrary);
  if (!resolved.startsWith(projectRoot + path.sep)) throw new Error('动作模板目录超出项目范围');
  return resolved;
}
