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

// Use the same evidence for stored profiles, new analyses and prompt validation.
// A positioned door is a visible door in the scene-analysis schema; an explicit
// negative/uncertain observation must never enable a door action.
export function sceneEvidenceTags(sceneProfile) {
  const tags = new Set(sceneProfile?.sceneTags || []);
  for (const door of sceneProfile?.doors || []) {
    const position = String(door?.position || '').trim();
    if (!position || door.visible === false || door.confirmed === false || /疑似|可能|不确定|不可见|遮挡|未确认|没有|无房门|unknown|uncertain|possibly|not visible/i.test(position)) continue;
    tags.add('visible_door');
    if (door.cardAccess === true) tags.add('visible_card_door');
    if (door.nearby === true && tags.has('clear_walkway')) tags.add('nearby_visible_door');
  }
  return [...tags];
}

export function compatibility(template, sceneProfile) {
  if (!sceneProfile) return { compatible: false, reasons: ['底图尚未分析'] };
  const tags = new Set(sceneEvidenceTags(sceneProfile));
  const missing = template.sceneTags.filter(required => !(aliases[required] || [required]).some(tag => tags.has(tag)));
  const reasons = missing.map(tag => ({ corridor: '场景档案未确认可用走廊', visible_door: '场景档案未确认可见的真实房门，可校正档案', visible_card_door: '场景档案未确认可见的刷卡器与房门', nearby_visible_door: '场景档案未确认近处房门及可达路线', clear_walkway: '场景档案未确认连续的可行走通道', side_area: '场景档案未确认可容纳三人停留的走廊侧区' }[tag] || `场景档案未确认 ${tag}`));
  if (Number(sceneProfile.maxPeople || 0) < template.people) reasons.push(`底图最多适合 ${sceneProfile.maxPeople || 0} 人，模板需要 ${template.people} 人`);
  return { compatible: reasons.length === 0, reasons };
}

export function templatesWithCompatibility(sceneProfile, directory = actionSkillDirectory, options = {}) {
  return loadActionTemplates(directory, options).map(template => ({ ...template, compatibility: compatibility(template, sceneProfile) }));
}
