# 短剧带货 Skill 合集（6 个）

打包时间：2026-10-10 ｜ 来源：`C:\Users\Administrator\.workbuddy\skills\`

> 文件夹名 = skill 原始 slug，**可整目录直接复制回 `~/.workbuddy/skills/` 使用**，不要改名（改名会导致技能无法被识别）。

---

## 一、对照表：你要的 5 个 skill → 文件夹

| # | 你提到的名称 | 文件夹 | SKILL.md 里的 name | 文件数 | 体积 |
|---|---|---|---|---|---|
| 1 | 短剧带货文案助手 | `shenmajuqing` | 神马AIGC-剧情带货1.0版本 | 7 | 38K |
| 2 | AI短剧带货视频工厂 | `ai-drama-sales-video` | ai-drama-sales-video | 9 | 70K |
| 3 | 红果短剧带货型视频脚本设计 | `sddfqwerr` | hongguo-script | 5 | 38K |
| 4 | 狗血微短剧带货视频提示词 | `microdrama-ad-prompts` | microdrama-ad-prompts | 8 | 75K |
| 5 | 短剧带货视频｜AI杜老师 | `short-drama-video` | short-drama-video | 7 | 58K |
| 6 | （附赠）视频号微短剧带货脚本 | `dabao123654` | video-account-drama-script | 7 | 34K |

> 说明：第 1 项「短剧带货文案助手」在系统里对应的安装名是 `shenmajuqing`（神马AIGC-剧情带货，88 条真实视频蒸馏的情绪曲线方法论）；第 6 项是视频号 7-10 分钟长剧版本，一并打包，凑齐全场景。

---

## 二、怎么选：按场景对号入座

| 你要什么 | 用哪个 | 产出 |
|---|---|---|
| 30 秒竖屏剧情带货视频（即梦/Seedance 提示词） | `microdrama-ad-prompts` | 题材创意 + 导演时间轴 + 文生视频提示词 |
| 10 秒 4:3 反转带货短视频（不单独出人物图） | `short-drama-video` | 剧情钩子 + 结尾口播/福利 + 视频提示词 |
| 全链路自动出片（图片→视频→配音→字幕→ffmpeg 合成→质检） | `ai-drama-sales-video` | 1080×1920 竖屏成片 + 6 种短剧类型库 |
| 红果/图文种草型口播稿、挂车转化文案 | `sddfqwerr` | 四层递进种草 + RPM 转化漏斗 + 分镜/图文结构 |
| 短视频脚本 + 口播文案 + AI 视频提示词（情绪曲线法） | `shenmajuqing` | 钩子→反转→产品出场→信任型 CTA 四段式 |
| 视频号 7-10 分钟/集连载微剧 | `dabao123654` | 角色设定 + 分集梗概 + 多幕剧本 + 系列规划 |

**一句话决策**：要成片 → `ai-drama-sales-video`；要提示词 → `microdrama-ad-prompts`；要文案/口播 → `sddfqwerr` 或 `shenmajuqing`；要单条 10 秒爆量短片 → `short-drama-video`；要长剧集 → `dabao123654`。

---

## 三、安装方法

### 方式 A：全部安装（推荐）
把 `短剧带货Skill合集` 里的 6 个文件夹，全部复制到：

```
C:\Users\Administrator\.workbuddy\skills\
```

### 方式 B：只装某一个
复制单个文件夹（如 `microdrama-ad-prompts`）到上面同一目录即可。

### 生效
复制完成后，新开一个会话，或让助手重新加载技能列表。直接说需求触发，例如：
- 「用短剧卖这个便携风扇，出 30 秒视频」
- 「写个红果口播稿，卖足浴店套餐」

---

## 四、目录结构

```
短剧带货Skill合集/
├── README.md                        ← 本文件
├── ai-drama-sales-video/            AI短剧带货视频工厂
│   ├── SKILL.md
│   ├── references/  drama-types.md / product-placement.md / prompt-blueprints.md / qa-checklist.md
│   └── scripts/     drama.py / dewatermark.py
├── dabao123654/                     视频号微短剧带货脚本
│   ├── SKILL.md
│   ├── assets/      drama_template.md
│   └── references/  drama_frameworks.md / case_studies.md
├── microdrama-ad-prompts/           30秒微短剧带货提示词
│   ├── SKILL.md
│   ├── agents/      openai.yaml
│   └── references/  prompt-rules.md / story-ideas.md / topics.md
├── sddfqwerr/                       红果短剧带货型脚本
│   ├── SKILL.md
│   └── references/  platform-guide.md / video-framework.md
├── shenmajuqing/                    神马AIGC·剧情带货
│   ├── SKILL.md
│   ├── manifest.yaml / test-prompts.json / 发布清单.md
│   └── _icon.png
└── short-drama-video/               短剧带货视频｜AI杜老师
    ├── SKILL.md
    └── references/  drama-playbook.md / proposal-template.md / video-prompt-template.md
```

---

## 五、注意

- `_meta.json` / `_skillhub_meta.json` 是安装来源记录，保留即可，不影响使用。
- `ai-drama-sales-video` 依赖 `ffmpeg` 和 Python 环境合成视频，用前确认本机已装 ffmpeg。
- 涉及客户、合同、报价的对外输出，发出前先过一遍人工审核。
