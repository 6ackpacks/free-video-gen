import fs from 'node:fs';
import {loadActionTemplates} from '../action-templates.js';
import {FOOTSPA_REFERENCE_CATALOG,footspaActionPrompt,footspaKeyframePrompt} from '../footspa-reference-library.js';
const actions=loadActionTemplates();
const text=['# 足浴监控获客：全部模板提示词验收稿','共25个动作。先验收提示词与参考对应，不代表已经验证实际视频效果。以下为6秒基准版；应用中可切换5–8秒、画幅和人物参考模式。每个动作独立输出，不混合成一个长剧情。','## 验收方式','先看参考动作，再检查人数、起始站位、运动路线、进门顺序与结束状态；有门店底图时优先使用真实空间。人物图可选，图像提示词负责首帧，视频提示词负责运动。'];
for(const action of actions){
 const clips=FOOTSPA_REFERENCE_CATALOG.clips.filter(c=>c.actionIds.includes(action.id));
 text.push(`## ${action.id} · ${action.name}`,`场景条件：${action.sceneTags.join('、')}。人数：${action.people}。结束状态：${action.endState}`);
 text.push(clips.length?clips.map(c=>{const s=FOOTSPA_REFERENCE_CATALOG.sources.find(s=>s.id===c.sourceId);return `参考：[${s.title}](${s.url})；画面观察：${c.observation}（原片${c.duration}秒）。`;}).join('\n'):'暂无对应参考视频，保留原有动作内容。');
 text.push('### 首帧图像提示词',footspaKeyframePrompt(action), '### 视频提示词 · 6秒',footspaActionPrompt(action), '### 5秒与8秒调整','5秒：从核心动作附近开始，压缩停顿与行走路程，保持结束状态。8秒：保持正常步速，增加自然停顿，不增加第二个事件。');
}
text.push('## 仅外链参考','[龙沐养生SPA：我们的日常](https://v.douyin.com/F-TG96WT0wI/)：当前没有独立本地文件，不猜测具体动作。','## 生成测试','浏览器交互和提示词规则已测试；实际视频输出由用户下一步验收。当前不自动提交视频或首帧生成。');
fs.writeFileSync(new URL('../prompt-skills/foot-spa-video-prompt-skill/全部模板提示词验收稿.md',import.meta.url),text.join('\n\n')+'\n');
console.log(`已整理 ${actions.length} 个动作的首帧和视频提示词。`);
