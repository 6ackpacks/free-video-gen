import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const directory = path.join(root, 'skills');
fs.mkdirSync(directory, { recursive: true });

const clean = (value, max = 1200) => String(value ?? '').trim().slice(0, max);
const cleanList = value => (Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/)).map(item => clean(item, 240)).filter(Boolean).slice(0, 100);
export function listSkills() {
  return fs.readdirSync(directory).filter(name => name.endsWith('.json')).flatMap(name => {
    try { return [JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))]; } catch { return []; }
  }).filter(skill => !skill.archived).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
export function saveSkill(input, id = randomUUID()) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('无效的 skill ID');
  let prior = {};
  const filename = path.join(directory, `${id}.json`);
  if (fs.existsSync(filename)) try { prior = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { /* use incoming fields */ }
  const skill = {
    id, name: clean(input.name, 60), style: clean(input.style), camera: clean(input.camera),
    instructions: clean(input.instructions ?? prior.instructions, 30000), promptGuide: clean(input.promptGuide ?? prior.promptGuide, 5000), audioDirection: clean(input.audioDirection ?? prior.audioDirection, 500),
    faces: cleanList(input.faces), scenes: cleanList(input.scenes), clothes: cleanList(input.clothes), actions: cleanList(input.actions),
    updatedAt: new Date().toISOString()
  };
  if (!skill.name) throw new Error('请填写风格名称');
  for (const key of ['faces', 'scenes', 'clothes', 'actions']) if (!skill[key].length) throw new Error(`请填写至少一条${{ faces:'人物外观', scenes:'场景', clothes:'衣服', actions:'动作' }[key]}`);
  fs.writeFileSync(filename, JSON.stringify(skill, null, 2));
  return skill;
}
const hash = text => parseInt(createHash('sha256').update(text).digest('hex').slice(0, 8), 16);
export function planBatch(input) {
  const base = clean(input.basePrompt, 6000);
  if (!base) throw new Error('请填写画面描述');
  const ids = Array.isArray(input.skillIds) ? [...new Set(input.skillIds)] : [];
  const count = Number(input.countPerSkill);
  if (!ids.length) throw new Error('请选择至少一个 skill');
  if (!Number.isInteger(count) || count < 1 || count > 500 || ids.length * count > 500) throw new Error('单次最多 500 条');
  const variantKey = clean(input.variantKey, 100);
  const skills = listSkills();
  const selected = ids.map(id => skills.find(skill => skill.id === id));
  if (selected.some(skill => !skill)) throw new Error('所选 skill 不存在');
  const used = new Set();
  const jobs = [];
  for (const skill of selected) for (let index = 0; index < count; index++) {
    const lists = [skill.faces, skill.scenes, skill.clothes, skill.actions];
    const space = lists.reduce((product, list) => product * list.length, 1);
    let choice;
    for (let offset = 0; offset < Math.max(1, Math.min(space, 10000)); offset++) {
      let n = (hash(`${skill.id}:${variantKey}:${index}`) + offset) % space;
      const parts = lists.map(list => { const item = list[n % list.length]; n = Math.floor(n / list.length); return item; });
      const key = parts.join('\u0000');
      if (!used.has(key)) { used.add(key); choice = parts; break; }
    }
    if (!choice) {
      let n = hash(`${skill.id}:${variantKey}:${index}`) % space;
      choice = lists.map(list => { const item = list[n % list.length]; n = Math.floor(n / list.length); return item; });
    }
    const [face, scene, clothes, action] = choice;
    const seed = hash(`${skill.id}:${variantKey}:${index}:${base}`) % 2147483647;
    const prompt = [
      base,
      `风格：${skill.name}。${skill.style}`,
      skill.camera && `镜头：${skill.camera}`,
      `人物面貌：${face}。本条人物身份与其他输出不同。`,
      `场景：${scene}。`, `服装：${clothes}。`, `动作：${action}。`,
      `单条视频只呈现此场景；保持人物外貌、服装和空间连续一致。`
    ].filter(Boolean).join('\n');
    jobs.push({ id: randomUUID(), skillId: skill.id, skillName: skill.name, index: index + 1, seed, prompt, choices: { face, scene, clothes, action } });
  }
  return jobs;
}
