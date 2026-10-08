import { randomUUID } from 'node:crypto';
import { compatibility } from './action-templates.js';

export const QUALITY_TEXT = '画面呈现老旧摄像头拍摄质感，固定高位视角全程静止，构图、透视和机位不变；彩色画面轻微模糊，灰蒙蒙一层雾感，低对比，带噪点和视频压缩痕迹，保留底图已有的时间戳与通道编号，不增加新的监控界面或标识。';
export const AUDIO_TEXT = '全程使用优雅、舒缓、无歌词的纯音乐。人物可以有自然说话嘴型，但音轨中没有可听见的人声、对白、耳语或歌词。';
export const KTV_QUALITY_TEXT = '严格保持底图空间与固定机位，呈现真实商务 KTV 夜间手机视频质感：霓虹和氛围灯颜色鲜明但不过曝，人物面部可辨，保留轻微低照度噪点和真实运动模糊；不新增底图没有的沙发、屏幕、桌子、麦克风、酒水或房门。';
export const KTV_AUDIO_TEXT = '配上热闹但不过分嘈杂的 KTV 纯音乐伴奏和轻微现场氛围声；不使用受版权保护的可辨识歌词，不出现清晰对白、辱骂或醉酒喧闹。';

const femaleLooks = ['22岁年轻成年亚洲女性，鹅蛋脸，黑色低盘发，身材匀称', '25岁年轻成年亚洲女性，精致圆脸，黑色披肩直发，曲线自然', '27岁年轻成年亚洲女性，清秀瓜子脸，黑色高马尾，身材匀称', '30岁年轻成年亚洲女性，柔和鹅蛋脸，黑色微卷长发，曲线自然'];
const femaleClothes = ['酒红色常规圆领修身短袖上衣配黑色及膝裙和低跟鞋，胸线完整遮挡', '墨绿色常规领修身中长裙配细腰带和低跟鞋，剪裁得体', '米白色高圆领短袖上衣配深棕色及膝裙和低跟鞋，面料不透明', '宝蓝色常规圆领亮面中长裙配简洁耳饰和低跟鞋，鲜艳得体', '黑色高圆领修身 T 恤配酒红色及膝裙和低跟鞋，衣料不透明', '暗紫色常规领光泽中长裙配低跟鞋，胸口完整覆盖', '象牙白常规圆领短袖上衣配深棕色及膝裙和低跟鞋，整体合身得体'];
const maleLooks = ['成年亚洲男性，普通成熟面容，体型微胖，短发', '成年亚洲男性，普通自然面容，身材壮实，短发', '成年亚洲男性，面容朴素，体型偏胖，发际线略后移', '成年亚洲男性，普通成熟面容，身材瘦小，短发'];
const maleClothes = ['深色短袖 T 恤配普通牛仔裤和休闲鞋', '灰色 Polo 衫配卡其休闲长裤和运动鞋', '藏蓝色短袖配深色休闲短裤和便鞋', '素色 T 恤配普通直筒长裤和休闲鞋'];

function choose(list, seed) { return list[Math.abs(seed) % list.length]; }
function roles(template) {
  if (Array.isArray(template.roles) && template.roles.length) return template.roles.map(role => role === 'female' ? 'female' : 'male');
  if (template.id === 'action-06') return ['male'];
  if (['action-05', 'action-12', 'action-13'].includes(template.id)) return Array(template.people).fill('female');
  if (template.people === 1) return ['female'];
  return ['female', 'male'];
}

export function makeCharacters(template, index = 0, preferences = {}) {
  const selectedRoles = roles(template);
  let femaleIndex = 0;
  return selectedRoles.map((role, position) => {
    const seed = index * 11 + position * 5 + Number.parseInt(template.id.slice(-2), 10);
    if (role === 'female') {
      const character = {
        role: template.characterProfile === 'ktv-business' ? 'adult_female_host' : 'adult_female_staff', appearance: preferences.femaleAppearance || choose(femaleLooks, seed + femaleIndex),
        clothing: preferences.femaleClothing || choose(femaleClothes, seed * 3 + femaleIndex * 2)
      };
      femaleIndex++;
      return character;
    }
    return { role: 'adult_male_guest', appearance: preferences.maleAppearance || choose(maleLooks, seed), clothing: preferences.maleClothing || choose(maleClothes, seed * 3) };
  });
}

export function compilePrompt({ referenceId, sceneProfile, template, characters, duration = 6, aspectRatio = '9:16', index = 1, userPrompt = '' }) {
  const check = compatibility(template, sceneProfile);
  if (!check.compatible) throw new Error(`动作模板与底图不兼容：${check.reasons.join('；')}`);
  const peopleText = characters.map((character, i) => `人物 ${i + 1}：${character.appearance}，穿${character.clothing}。`).join('\n');
  const sections = {
    format: `${duration} 秒、${aspectRatio} 竖屏、单一连续镜头。`,
    scene: `严格保持固定底图原有空间：${sceneProfile.description} 只使用底图中真实存在的门、通道、装饰和可行走区域，不补造物件或空间。`,
    characters: peopleText,
    lockedAction: template.actionText,
    endState: template.endState,
    ...(String(userPrompt || '').trim() ? { userPrompt: `用户补充要求：${String(userPrompt).trim()}。此要求只能补充视觉气氛或细节，不得改变锁定动作、人物关系、运动方向和结束状态。` } : {}),
    quality: template.renderProfile === 'ktv-nightlife' ? KTV_QUALITY_TEXT : QUALITY_TEXT,
    audio: template.renderProfile === 'ktv-nightlife' ? KTV_AUDIO_TEXT : AUDIO_TEXT
  };
  const prompt = [sections.format, sections.scene, sections.characters, `固定动作（必须原样执行，不增加、不删减、不调整顺序）：\n${sections.lockedAction}`, `固定结束状态：${sections.endState}`, sections.userPrompt, sections.quality, sections.audio].filter(Boolean).join('\n\n');
  if (/CCTV/i.test(prompt)) throw new Error('最终提示词不得包含 CCTV');
  if (!prompt.includes(template.actionText) || !prompt.includes(template.endState)) throw new Error('锁定动作或结束状态校验失败');
  return { id: randomUUID(), index, referenceId, actionId: template.id, actionName: template.name, endState: template.endState, sceneProfile, characters, sections, prompt };
}

export function selectTemplate({ templates, actionId, mode = 'manual', recentActionIds = [] }) {
  const compatible = templates.filter(item => item.compatibility?.compatible);
  if (!compatible.length) throw new Error('当前底图没有兼容的动作模板');
  if (mode === 'random') {
    const fresh = compatible.filter(item => !recentActionIds.slice(-5).includes(item.id));
    const pool = fresh.length ? fresh : compatible;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const selected = templates.find(item => item.id === actionId);
  if (!selected) throw new Error('请选择动作模板');
  if (!selected.compatibility?.compatible) throw new Error(`动作模板与底图不兼容：${selected.compatibility?.reasons?.join('；') || '空间条件不满足'}`);
  return selected;
}
