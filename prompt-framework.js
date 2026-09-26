// Shared constraints for every Qwen-written video prompt in this workbench.
// Keep this focused on the image and the action; the selected skill supplies variations.
export const VIDEO_PROMPT_FRAME = `你为一个 6 秒、9:16 竖屏视频写英文提示词。每条视频固定满足：
1. 真实廉价老旧 CCTV 监控录像。摄像头固定在足浴、足疗、养生或私人会所，或豪华酒店的高处，俯拍、轻微广角、单一连续镜头；全程不移动、不摇移、不变焦、不跟拍、不切镜。人物不看镜头。
2. 两名明确成年的亚洲人物始终共同活动。女性视觉年龄 20–25 岁，漂亮、有女人味，穿修身会所接待制服、旗袍式制服，或制服上衣搭配包臀裙和高跟鞋，得体且不过度暴露。男性视觉年龄 35–55 岁，具有成熟老板或商务精英气质，外形自然，可以微胖、壮实或略有肚腩，避免年轻男模感。
3. 地点和事件可以自由变化：两人可以一起走楼梯、沿楼道行走、慢慢走过会所、靠近房门、开门进入同一房间，或在监控范围内进行其他简单共同活动。正面、侧面、背面均可。进入房间只是可选剧情，不是每条视频的固定结局。
4. 每条只设计一个主要事件和一个自然暧昧互动。两人始终一起行动，不安排一人长时间站着等待另一人。互动融入连续动作，可以是对视微笑、回头笑、挽手、牵手、碰手臂、拉袖口、靠近、扶腰、搂肩、整理衣领、短暂拥抱或快速自然轻吻。不要机械堆砌动作。
5. 画面灰蒙、泛白、低饱和、低对比、轻微软焦，带数字噪点、压缩痕迹、轻微运动拖影与不完美曝光。禁止现代高清和电影感。
6. 无对白和人声。加入轻柔、暧昧、优雅、舒缓的后期纯音乐，无歌词。画面带随机 CCTV 日期时间、通道号和 Camera 编号。

按“镜头与场景 → 两人外观服装 → 一个连续事件与互动 → CCTV 画质和声音”的顺序写。动作必须在 6 秒内自然完成。楼梯场景不再强制同时进房；进门场景若选择，则两人必须一起进入同一个房间。只输出一段 110–170 个英文单词的可直接提交视频模型的提示词，不要标题、解释、时间轴、变量名或 Negative Prompt。`;

export function draftMessages(job, skill) {
  const guide = skill?.promptGuide ? `\n\n所选视频类型的补充规则：${skill.promptGuide}` : '';
  const audio = skill?.audioDirection?.trim() ? `\n\n此类型明确指定声音时，再加入一句简短声音描述：${skill.audioDirection.trim()}` : '';
  const reference = job.referenceId
    ? '如有背景参考图，沿用其空间布局，在该监控范围内设计共同动作。'
    : '';
  return [
    { role: 'system', content: VIDEO_PROMPT_FRAME + guide + audio },
    { role: 'user', content: `写第 ${job.index} 条视频提示词。下列内容是可变化的素材，若与固定框架冲突，以固定框架为准。${reference}\n${job.prompt}` }
  ];
}

export function cleanDraft(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('Qwen 未返回提示词');
  const text = content.trim()
    .replace(/^```(?:\w+)?\s*|\s*```$/g, '')
    .replace(/^\s*(?:#{1,3}\s*)?(?:Full English Prompt|Video Prompt|Prompt)\s*:\s*/i, '')
    .split(/\n\s*(?:#{1,3}\s*)?Negative Prompt\s*:/i)[0]
    .trim();
  if (!text) throw new Error('Qwen 未返回视频画面提示词');
  return text.slice(0, 1800);
}
