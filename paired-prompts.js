import { FEMALE_CLOTHES, FEMALE_WARDROBE_RULES } from './wardrobe-rules.js';
import { createHash, randomUUID } from 'node:crypto';

const homeSetups = [
  {
    id: 'sofa',
    scene: '普通中国家庭客厅，家用布艺沙发、电视与电视柜、茶几、窗帘、靠垫、家庭照片和绿植清楚可见，一眼能看出是在真实家里',
    placement: '顾客靠坐在家用沙发上，技师坐在沙发前的普通家用小凳上'
  },
  {
    id: 'bed',
    scene: '普通中国家庭卧室，家用床、床头板、枕头、床头柜、衣柜、窗帘和生活用品清楚可见，一眼能看出是在真实家里',
    placement: '顾客躺靠在普通家用床上，技师坐在床尾或床边的普通椅子上'
  }
];

// Reuses the established character pool from prompt-compiler.js.
const femaleLooks = [
  '22岁年轻成年亚洲女性，鹅蛋脸，黑色低盘发，身材匀称',
  '25岁年轻成年亚洲女性，精致圆脸，黑色披肩直发，曲线自然',
  '28岁年轻成年亚洲女性，清秀瓜子脸，黑色高马尾，身材匀称',
  '31岁年轻成年亚洲女性，柔和鹅蛋脸，黑色微卷长发，曲线自然'
];

// Shared adult fitted wardrobe options.
const femaleClothes = FEMALE_CLOTHES;

const homeDetails = [
  '傍晚暖色家用顶灯，茶几上有水杯和水果，生活气息自然',
  '白天窗边自然光，家具略有使用痕迹，像随手拍摄的真实家庭',
  '夜晚柔和家用灯光，背景有遥控器、纸巾盒和普通摆件',
  '阴天漫射自然光，床品或沙发织物有真实褶皱，不做样板间布置'
];

const shots = [
  {
    id: 'action-pov', focus: 'action', foot: 'visible',
    text: '严格第一人称顾客视角，顾客双腿和双脚位于前景，清楚展示技师双手按摩其中一只脚，同时完整带到技师美丽自然的面部和上半身，动作与人物都一眼可懂'
  },
  {
    id: 'side-pov', focus: 'balanced', foot: 'partial',
    text: '第一人称略偏侧面的随手拍角度，只让一只脚和部分小腿进入画面下缘，同时完整看到技师面部、上半身和按摩双手'
  },
  {
    id: 'portrait-pov', focus: 'beauty', foot: 'partial',
    text: '第一人称胸口高度的近景构图，重点展示技师自然美丽的面容和专注神态，正在按摩的脚只在画面下角局部出现'
  },
  {
    id: 'beauty-crop', focus: 'beauty', foot: 'hidden',
    text: '第一人称近景抓拍，重点展示技师面部、穿搭和向下工作的双手；顾客脚部位于画面下方之外不直接露出，但她坐在顾客腿前持续足部按摩的姿态和视线必须明确'
  },
];

const hash = value => Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16) % 2147483648;
const pick = (list, seed, offset = 0) => list[(seed + offset) % list.length];
const filterHome = mode => mode === 'sofa' || mode === 'bed' ? homeSetups.filter(x => x.id === mode) : homeSetups;
const filterShots = (focusMode, footMode) => {
  let result = shots;
  if (focusMode && focusMode !== 'mixed') result = result.filter(x => x.focus === focusMode || (focusMode === 'action' && x.focus === 'balanced'));
  if (footMode === 'visible') result = result.filter(x => x.foot === 'visible');
  if (footMode === 'hidden') result = result.filter(x => x.foot === 'hidden');
  return result.length ? result : shots;
};

export const YIQU_TEMPLATE = {
  id: 'yiqushuxin-home-pov-i2v-v2',
  name: '伊趣舒心 · 家庭上门足部按摩',
  brandText: '伊趣舒心',
  aspectRatio: '9:16',
  modes: ['fixed-background', 'one-image-one-video']
};

export const DEFAULT_VIDEO_BGM = '配上优雅暧昧的音乐。音乐为无歌词纯音乐；无对白、无耳语、无可听见的人声。';

export const FORBIDDEN_APPEARANCE = /(露乳|裸露乳头|露点|裸露私密部位)/i;
const NEGATED_FORBIDDEN_APPEARANCE = /(?:不|不得|禁止|避免|没有|无|非)(?:出现)?(?:露乳|裸露乳头|露点|裸露私密部位)/gi;

export function hasForbiddenAppearance(value) {
  return FORBIDDEN_APPEARANCE.test(String(value || '').replace(NEGATED_FORBIDDEN_APPEARANCE, ''));
}

export function planPromptPairs(input = {}) {
  const count = Number(input.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('生成数量须为 1–500');
  const brandText = String(input.brandText || YIQU_TEMPLATE.brandText).trim().slice(0, 20);
  if (!brandText) throw new Error('品牌文字不能为空');
  const variantKey = String(input.variantKey || Date.now()).slice(0, 100);
  const scenePool = filterHome(input.sceneMode);
  const shotPool = filterShots(input.focusMode || 'mixed', input.footMode || 'mixed');
  const userImagePrompt = String(input.imagePrompt || '').trim().slice(0, 2000);
  const userVideoPrompt = String(input.videoPrompt || '').trim().slice(0, 2000);
  const batchSeed = hash(`${variantKey}:${brandText}`);

  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const seed = hash(`${variantKey}:${index}:${brandText}`);
    // Rotate adjacent outputs through independent pools before combinations repeat.
    const home = pick(scenePool, batchSeed, offset);
    const appearance = pick(femaleLooks, Math.floor(batchSeed / 3), offset);
    const clothing = pick(femaleClothes, Math.floor(batchSeed / 5), offset);
    const shot = pick(shotPool, Math.floor(batchSeed / 7), offset);
    const detail = pick(homeDetails, Math.floor(batchSeed / 11), offset);
    const identity = `${appearance}，是一名上门足浴技师，穿${clothing}。人物身份、脸型、发型与上一条不同，服装采用艳丽修身剪裁，从用户认可的 30 套服装搭配中选择。她在左胸佩戴独立简洁工牌，工牌准确写着“${brandText}”。`;
    const imagePrompt = [
      '生成一张真实手机随手拍质感的 9:16 竖版视频视觉参考图；它用于确定人物、服装、家庭场景和服务关系，不要求后续视频从这张静态姿势开始。不要影棚感、广告棚拍感或统一样板图感。',
      '只允许一张完整的单幅照片、一个连续家庭空间和一位技师；禁止拼图、三联画、分镜、网格、多画面、多机位并排、同一人物重复出现或多个场景合成。',
      `${home.scene}；${detail}。${home.placement}。`,
      `${shot.text}。`,
      identity,
      '技师身体自然前倾，双手正在进行专业、自然的足部按摩；即使脚部被裁切，也必须通过手部位置、身体姿态、视线方向和第一人称关系让观众理解她正在给顾客按摩脚。',
      `品牌文字只出现在胸牌上，必须是完整清晰的“${brandText}”四个中文字，不得变形或出现错别字。`,
      `服装规则：${FEMALE_WARDROBE_RULES}`,
      '技师必须是 22–32 岁的年轻成年女性，不得呈现中年或老年外貌。服务关系专业自然；双手、手指、腿脚结构准确，不出现多余或融合肢体。',
      '禁止浴巾、专业脚凳、足浴椅、护理瓶罐、会所木格栅、酒店灯光、按摩店装修、第三人称机位、水印和无关文字。',
      userImagePrompt
    ].filter(Boolean).join('\n');
    const videoPrompt = [
      '输入图片只作为人物、服装、家庭背景和服务关系的视觉参考，不锁定为视频第一帧，不复刻图片中的固定姿势。9:16 竖屏、单一连续镜头，保持第一人称顾客视角，不切换第三人称。',
      `技师整段持续做自然专业的足部按摩，任何时刻至少一只手接触、承托或按摩顾客脚部；动作小幅、连续、符合人体结构。胸牌“${brandText}”保持稳定，人物、服装和家庭环境不变化。`,
      '禁止换人、换装、转身背离顾客、中途停手、双手同时离开顾客脚部、把双手放在自己腿上、脚部或双手畸变、多手多脚、场景跳变、镜头漂移、文字变形和新增门店元素。',
      DEFAULT_VIDEO_BGM,
      userVideoPrompt
    ].filter(Boolean).join('\n');
    return {
      id: randomUUID(), index, templateId: YIQU_TEMPLATE.id, brandText, seed,
      variation: { home: home.id, appearance, clothing, shot: shot.id, focus: shot.focus, foot: shot.foot, detail },
      imagePrompt, videoPrompt
    };
  });
}
