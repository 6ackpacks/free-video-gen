# 爆款复刻与短剧字幕（基础版）

## 入口与流程
- 左侧「爆款复刻」：导入本机视频 → 抽取12张关键帧 → 点击分析 → 编辑固定规则、变量候选值、相对动作节奏 → 预览提示词 → 生成1条试片 → 确认效果 → 批量生成。
- 「我的预设」：保存、编辑、删除复刻模板，添加手动模板，从预设创建批次。原有生成设置预设仍可使用。
- 「短剧生成」：页面标题旁的「字幕渲染」，或已完成视频卡片上的「字幕渲染」。导入本机视频/本机已保存成片 → 输入每行字幕 → 可指定 `[0-3] 文本` → 导出 SRT 或渲染成片。

## 原理与边界
参考 Hypit 的时间语义拆解和可替换内容思路；没有安装它的素材库、SVML/SVS引擎、收费服务或模型。
基础版分析仅上传最多12张JPEG关键帧，视频文件留在本机。关键帧不能可靠还原快速动作及音轨，界面要求补充对白与音乐，输出区分事实和未确认项。分析使用现有 sceneAnalysisModel/Qwen API，点击分析会消耗模型额度。
模板 `{{变量}}` 映射候选值，保留 `{{duration}}`。动作段落使用0–1相对时间，批量提交前换算成实际秒数。候选组合轮换；超过组合数量仅更换随机种子，不保证人物或内容绝对不同。
生成继续使用已有路由、账号池、并发控制和VideoQueue；所选商品/场景图作为真实图片附件提交。关键帧不会自动作为生成附件。模型参数按现有路由校验，豆包按5/10/15秒能力限制。
试片确认仅对相同模板与生成参数生效。也允许用户明确选择「我已确认模板，直接批量生成」。请求UUID做批次去重，网络响应中断后重复提交沿用原请求。
字幕使用浏览器canvas与MediaRecorder本机合成，保留原音轨，不要求视频模型画字，不自动下载远程视频。MP4编码可用则导出MP4，否则导出WebM；输入≤120秒、≤300MB，渲染宽度≤720px。渲染按视频时长运行，请保持本页可见。当前字幕按每行平均分配，支持手动时间；不自动转写语音或对齐台词。

## 数据
- data/replica-sources：关键帧与参考记录（可删除，不影响已保存模板）。
- data/replica-analysis-tasks.json：后台分析任务与结果，重启中断会标记错误。
- data/workspace-ui.json：复刻预设、变量、规则及生成/参考图设置，保留旧预设。
- 浏览器 replica:draft:v1：编辑草稿、试片批次、任务标识；切换页面可恢复。
- 浏览器 story:subtitles:<jobId>：字幕编辑草稿。字幕成片经浏览器下载到本机。

## 验证
- 根目录 Node 测试：模板完整性、候选组合、时长/图片校验、豆包长度限制、本机关键帧持久化、预设更新。
- data/verify-replica-ui.py：本机录制测试片，实际抽帧；模拟分析/生成接口验证缓存、试片/批量门禁、预设复用；字幕实际编码并检查字幕像素与音频解码。没有付费模型生成任务。
- data/verify-frontend-redesign.py 与 data/verify-story-ui.py：原页面布局和原有生成流程回归。

参考：https://github.com/hypit-ai/hypit 和 skills/hypit/references/creation/reference-video.md。

## TokenDance 文本与视觉接入
TEXT_PROVIDER=tokendance 时，现有 Qwen 提示词撰写、场景分析与复刻分析调用 TokenDance 的 /gateway/v1/chat/completions。
默认 TOKENDANCE_PROMPT_MODEL=qwen3.5-flash，TOKENDANCE_VISION_MODEL=qwen3-vl-plus。模型列表鉴权请求及两类小型真实请求已通过。
现有 Windows 加密的 TOKENDANCE 密钥复用，前端不接触密钥。最多3路并发、每分钟30次；超时、限流、鉴权错误显示服务名称，不泄漏密钥。
图片生成/图片上传仍由APIMart处理，Wan视频继续已有TokenDance路由；语音转写和Seedance参考视频直传尚未接入。TEXT_PROVIDER 改回 apimart 可恢复原文本路由，配置需要服务重新加载。
