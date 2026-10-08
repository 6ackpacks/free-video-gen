import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const actionSkillDirectory = path.join(root, 'prompt-skills', 'foot-spa-video-prompt-skill');

const aliases = {
  visible_card_door: ['visible_card_door'],
  nearby_visible_door: ['nearby_visible_door'],
  visible_door: ['visible_door', 'visible_card_door', 'nearby_visible_door'],
  clear_walkway: ['clear_walkway'],
  side_area: ['side_area'],
  corridor: ['corridor'],
  ktv_private_room: ['ktv_private_room'],
  karaoke_screen: ['karaoke_screen'],
  microphone: ['microphone'],
  sofa_area: ['sofa_area'],
  low_table: ['low_table'],
  song_selector: ['song_selector'],
  clear_floor: ['clear_floor', 'clear_walkway'],
  ktv_lobby: ['ktv_lobby'],
  reception_desk: ['reception_desk']
};

function frontmatter(text) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/m.exec(text);
  if (!match) throw new Error('动作模板缺少 frontmatter');
  const values = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (/^\[.*\]$/.test(value)) value = value.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
    else if (/^\d+$/.test(value)) value = Number(value);
    values[key] = value;
  }
  return { values, body: match[2] };
}

function section(body, heading) {
  const match = new RegExp(`## ${heading}\\s*\\n+([\\s\\S]*?)(?=\\n## |$)`).exec(body);
  return match?.[1]?.trim() || '';
}

export function loadActionTemplates(directory = actionSkillDirectory, options = {}) {
  const actionsDir = path.basename(directory) === 'actions' ? directory : path.join(directory, 'actions');
  if (!fs.existsSync(actionsDir)) throw new Error(`动作模板目录不存在：${actionsDir}`);
  const result = fs.readdirSync(actionsDir).filter(name => /^action-\d{2}.*\.md$/.test(name)).sort().map(filename => {
    const { values, body } = frontmatter(fs.readFileSync(path.join(actionsDir, filename), 'utf8'));
    const actionText = section(body, '固定动作正文');
    if (!values.id || !values.name || !actionText) throw new Error(`动作模板字段不完整：${filename}`);
    return {
      id: String(values.id), name: String(values.name), people: Number(values.people),
      roles: Array.isArray(values.roles) ? values.roles : [],
      characterProfile: String(values.character_profile || 'foot-spa'),
      renderProfile: String(values.render_profile || 'surveillance'),
      sceneTags: Array.isArray(values.scene_tags) ? values.scene_tags : [],
      endState: String(values.end_state || section(body, '结束状态')),
      actionText, summary: actionText.slice(0, 72) + (actionText.length > 72 ? '…' : ''),
      selectionEnabled: true, source: filename
    };
  });
  const expectedCount = Number(options.expectedCount || (path.resolve(directory) === path.resolve(actionSkillDirectory) ? 14 : 0));
  if (expectedCount && result.length !== expectedCount) throw new Error(`动作模板必须是 ${expectedCount} 个`);
  if (new Set(result.map(x => x.id)).size !== result.length) throw new Error('动作模板 ID 必须唯一');
  return result;
}

export function compatibility(template, sceneProfile) {
  if (!sceneProfile) return { compatible: false, reasons: ['底图尚未分析'] };
  const tags = new Set(sceneProfile.sceneTags || []);
  const missing = template.sceneTags.filter(required => !(aliases[required] || [required]).some(tag => tags.has(tag)));
  const reasons = missing.map(tag => ({ corridor: '底图不是可用走廊', visible_door: '底图中没有清晰可见的真实房门', visible_card_door: '底图中没有清晰可见的刷卡房门', nearby_visible_door: '底图中没有位于可达近处的真实房门', clear_walkway: '底图中没有足够连续的可行走通道', side_area: '底图中没有可容纳三人停留的走廊侧区' }[tag] || `底图缺少 ${tag}`));
  if (Number(sceneProfile.maxPeople || 0) < template.people) reasons.push(`底图最多适合 ${sceneProfile.maxPeople || 0} 人，模板需要 ${template.people} 人`);
  return { compatible: reasons.length === 0, reasons };
}

export function templatesWithCompatibility(sceneProfile, directory = actionSkillDirectory, options = {}) {
  return loadActionTemplates(directory, options).map(template => ({ ...template, compatibility: compatibility(template, sceneProfile) }));
}
