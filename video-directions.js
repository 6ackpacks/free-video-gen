import { DEFAULT_VIDEO_BGM } from './paired-prompts.js';

export const VIDEO_PROMPT_VERSION = 'home-massage-v3-contact-lock';

const cameras = [
  { id: 'front-medium', text: '第一人称中近景，镜头轻微偏左，技师面部、上半身和工作中的双手同时可见' },
  { id: 'side-close', text: '第一人称侧前方近景，镜头更靠近双手动作，同时保留技师完整面部' },
  { id: 'right-oblique', text: '第一人称右侧斜前方三分之四角度，技师始终面向顾客与服务部位，侧脸、上半身和双手动作同时可见' },
  { id: 'high-oblique', text: '第一人称略高位斜拍，人物、双手动作和身体朝向形成清楚层次' },
  { id: 'low-natural', text: '第一人称较低机位自然抓拍，构图不对称，像真实手机临时记录' },
  { id: 'portrait-action', text: '第一人称人像式中景，人物形象占主要画面，但服务动作仍清楚可懂' }
];

const motions = [
  { id: 'steady-rhythm', text: '动作轻缓连续，双手节奏稳定；坐姿与髋部位置固定，上半身只做极小幅度的自然起伏' },
  { id: 'alternate-hands', text: '双手交替完成服务动作，偶尔调整承托位置，动作自然且符合人体结构' },
  { id: 'focus-shift', text: '先专注手部动作，再自然抬眼看向顾客一瞬，随后继续服务' },
  { id: 'support-adjust', text: '技师只小幅调整承托手的位置，身体朝向保持不变，服务动作全程不中断' },
  { id: 'slow-detail', text: '动作速度较慢，突出手部细节和人物专注神态，不做夸张表演' }
];

const homeName = value => value === 'bed' ? '普通家庭卧室与家用床' : '普通家庭客厅与家用沙发';
const clean = (value, max = 3000) => String(value || '').trim().slice(0, max);

export function buildFlexibleVideoDirection(input = {}) {
  const index = Math.max(1, Number(input.index) || 1);
  const variation = input.variation || {};
  const camera = cameras[(index - 1) % cameras.length];
  const motion = motions[(index * 2 - 1) % motions.length];
  const batchPrompt = clean(input.batchPrompt);
  const itemPrompt = clean(input.itemPrompt);
  const userDirection = [batchPrompt, itemPrompt].filter(Boolean).join('；');
  const defaultAction = '若没有人工补充动作要求，默认表现成年女性上门足浴技师正在为顾客做自然专业的足部按摩。';
  const override = userDirection
    ? `本条人工补充指令拥有最高优先级：${userDirection}。若它改变按摩部位、人物朝向、动作或机位，以人工补充为准，不要继续套用默认足部按摩动作。`
    : defaultAction;
  const continuity = userDirection
    ? '动作连续性硬约束：整段视频持续执行人工指定的服务动作，服务对象和指定部位始终处于可操作位置；在需要接触的动作中，任何时刻至少一只手保持接触或承托。禁止中途停手、双手同时撤离、把双手放回自己腿上、摆拍、起身或离开画面。'
    : '足部按摩连续性硬约束：整段视频从开始到结束持续为顾客按摩脚，顾客脚部始终处于技师可操作的前景位置；任何时刻至少一只手必须接触、承托或按摩顾客脚部，双手可以交替但不能同时离开。禁止转身背离顾客、中途停手、把双手放回自己腿上或膝盖上、摆拍、起身或离开画面。';
  const prompt = [
    '图1只用于人物身份、穿搭、品牌和家庭氛围参考，不作为视频首帧，不复刻参考图的固定姿势与构图。生成一个新的真实瞬间。',
    `视觉锚点：${clean(variation.appearance, 500) || '成年亚洲女性足浴技师'}；穿${clean(variation.clothing, 500) || '日常得体、常规领且不透明的服装'}；场景为${homeName(variation.home)}；${clean(variation.detail, 500)}。`,
    `本条镜头：${camera.text}。本条动态：${motion.text}。`,
    override,
    continuity,
    '保持第一人称顾客视角、9:16 竖屏、单一连续镜头。技师人物形象与服务动作必须同时看懂；人物均为成年人，服务关系专业自然。',
    '工牌“伊趣舒心”保持清晰稳定。禁止低胸、透视、制服化、浴巾、足浴店或会所环境、第三人物、多手多脚、肢体融合、场景跳变和无关文字。',
    DEFAULT_VIDEO_BGM
  ].filter(Boolean).join('\n');
  return { prompt, camera, motion, userDirection, referenceMode: 'reference-image', promptVersion: VIDEO_PROMPT_VERSION };
}

export const VIDEO_DIRECTION_VARIANTS = { cameras, motions };
