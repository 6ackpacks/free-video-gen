# 视频工作台｜Agent 一键迁移接入指令

> 把本文件和 `video-workbench-electron-2026-09-27.zip` 一起交给新电脑上的开发 Agent。以下内容是执行指令；Agent 应直接完成安装、配置检查和本地验证，只在需要录入密钥或登录豆包账号时让用户操作。

## 一、迁移目标

将“帧间 · 固定底图批量视频工作台”部署到新电脑，并恢复以下能力：

1. APIMart：千问提示词、图片理解、监控底图加工、Grok 视频。
2. TokenDance：`wan3.0-video` 视频生成。
3. 阿里云百炼网关：`wan3.0-video` 视频生成。
4. DoubaoManager：豆包多账号登录池与 Seedance 视频生成。
5. 14 个固定动作模板、底图场景分析、试片确认和批量任务。

## 二、Agent 必须执行的步骤

### 1. 解压和安装

1. 将 ZIP 解压到普通可写目录，目录名保持为 `video-workbench`。
2. 确认已安装 Node.js 24 或更新版本、Git 和 PowerShell 7。
3. 在项目目录执行：

```powershell
npm ci
npm test
```

测试应显示 13 项通过。

### 2. 安全录入三个 API Key

项目包不包含明文 API Key。不要要求用户把密钥写入聊天、Markdown、`project.env` 或源码。

在 Windows 项目目录执行：

```powershell
pwsh -File .\setup-key.ps1
```

脚本会依次要求用户在本机终端输入：

1. APIMart API Key，必填。
2. TokenDance API Key，可选但建议配置。
3. 阿里云百炼 API Key，可选但建议配置。

输入内容不可见。脚本使用当前 Windows 用户的 DPAPI 加密，分别保存到：

- `data/api-key.dpapi`
- `data/tokendance-key.dpapi`
- `data/dashscope-key.dpapi`

这些文件只能由录入时的 Windows 用户解密，不能从旧电脑直接复制使用。

源电脑使用 macOS 钥匙串，服务名称如下，仅用于核对密钥槽位：

- `video-workbench-apimart`
- `video-workbench-tokendance`
- `video-workbench-dashscope`

### 3. 检查代理

`project.env` 当前默认：

```env
HTTPS_PROXY=http://127.0.0.1:7897
HTTP_PROXY=http://127.0.0.1:7897
NO_PROXY=127.0.0.1,localhost
```

检查新电脑代理端口。如果不是 `7897`，修改前两项；如果不使用 HTTP 代理，删除或注释前两项。远程上传和下载仍可能经过系统 VPN/TUN。

### 4. 启动工作台

执行：

```powershell
npm run desktop
```

也可以双击 `启动工作台.cmd`。浏览器模式使用：

```powershell
npm start
```

本地地址固定为 `http://127.0.0.1:4173/`。

### 5. 验证 API 路由

启动后执行：

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/provider | ConvertTo-Json -Depth 6
```

确认以下路由的 `configured` 为 `true`：

- `apimart`
- `wan-tokendance`
- `wan-aliyun`

`doubao` 是否真正可用，需要继续完成豆包账号池安装和登录。

### 6. 安装和登录豆包账号池

双击：

```text
安装并启动豆包管理器.cmd
```

脚本会克隆 `https://github.com/shukeCyp/DoubaoManager.git` 到 `integrations/DoubaoManager/` 并运行。随后在 Electron 工作台里添加豆包账号并逐个扫码登录。每个账号使用独立持久化会话；Cookie 不在迁移包中，必须在新电脑重新登录。

完成后检查：

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/doubao | ConvertTo-Json -Depth 5
```

返回 `ready: true` 才表示豆包视频路由可提交任务。

## 三、API 路由清单

### APIMart

- Base URL：`https://api.apimart.ai`
- 鉴权：`Authorization: Bearer <APIMART_API_KEY>`
- 提示词与读图：`POST /v1/chat/completions`
- 图片上传：`POST /v1/uploads/images`
- 监控底图加工：`POST /v1/images/generations`
- Grok 视频：`POST /v1/videos/generations`
- 查询异步任务：`GET /v1/tasks/{task_id}?language=zh`
- 提示词模型：`qwen3.7-flash`
- 场景分析模型：`qwen3.7-flash`
- 生图模型：`gpt-image-2.5-sunburst`
- 视频模型：`grok-imagine-1.5-video-ext`

### TokenDance Wan3

- 提交：`POST https://tokendance.space/gateway/alibaba/wan3/v1/video-synthesis`
- 查询：`GET https://tokendance.space/gateway/alibaba/wan3/v1/tasks/{task_id}`
- 鉴权：`Authorization: Bearer <TOKENDANCE_API_KEY>`
- 模型：`wan3.0-video`
- 参数：480P/720P/1080P、2–30 秒、首帧图生视频、无音频、无水印。
- 创建接口没有客户端幂等键；提交超时后不可自动重试，避免重复计费。

### 阿里云百炼 Wan3 网关

- 提交：`POST https://maas.qianwenaiapi.com/api/v1/services/aigc/video-generation/video-synthesis`
- 查询：`GET https://maas.qianwenaiapi.com/api/v1/tasks/{task_id}`
- 额外请求头：`X-DashScope-Async: enable`
- 鉴权：`Authorization: Bearer <DASHSCOPE_API_KEY>`
- 模型：`wan3.0-video`
- 参数：480P/720P/1080P、2–30 秒、首帧图生视频、无音频、无水印。

### 豆包账号池

- 模型：`seedance_v2.0_mini`
- 本地桥接：自动发现 `127.0.0.1` 上运行的 DoubaoManager。
- 工作台接口：`GET /api/doubao`
- 视频提示词会自动写入所选视频时间。
- 画幅默认 `9:16`，默认时间 5 秒。

## 四、压缩包中故意没有包含的内容

以下内容与电脑或账号绑定，因此不在 ZIP 内：

- 三个 API Key 及其钥匙串/DPAPI 文件。
- `node_modules/`，需在新电脑运行 `npm ci`。
- `data/` 下的底图、场景档案、任务、视频缓存、日志和历史记录。
- Electron 的豆包 Cookie、登录态和账号会话。
- `integrations/DoubaoManager/`，由安装脚本在新电脑重新克隆。
- `.git/` 历史。

如果用户明确要求迁移历史底图、任务或视频，可以从旧电脑单独复制 `video-workbench/data/`。不要复制旧电脑的 `*.dpapi` 到另一 Windows 用户；它们无法解密。复制历史数据前先备份新电脑的 `data/`，并在工作台完全关闭时操作。

## 五、最终验收

Agent 完成以下检查后再结束：

1. `npm test` 13 项全部通过。
2. `npm run desktop` 能打开工作台。
3. `/api/provider` 显示三条远程 API 路由已配置。
4. 上传一张测试图片后能够生成场景档案。
5. 14 个动作模板均可发现，并根据底图显示兼容状态。
6. 监控底图加工按钮能够创建异步任务。
7. 豆包账号池完成登录后 `/api/doubao` 返回 `ready: true`。
8. 未经用户明确同意，不提交付费生图或视频任务；本地连接验证不需要消耗额度。

如真实接口失败，先报告具体路由、HTTP 状态、响应错误和所用模型，不要静默切换到另一条会计费的路由。
