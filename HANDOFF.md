# 开发交接

## 已完成

- Electron 桌面入口：`electron/main.js`、`electron/preload.cjs`、`electron/account-store.js`。
- 豆包账号池：左侧账号表，右侧独立豆包网页；独立持久化会话、独立代理、启动/停止/删除/设置、默认并发 6。
- 固定底图场景档案：`references.js` 与 `apimart.js#analyzeScene`。
- 14 个 Markdown 动作模板已复制到 `prompt-skills/foot-spa-video-prompt-skill/actions/`。
- 模板解析与兼容判断：`action-templates.js`。
- 锁定动作提示词编译：`prompt-compiler.js`。
- Qwen 只生成人物外貌和穿搭；角色数量、角色关系、动作原文和结束状态由程序校验。
- 新前端：固定底图、场景档案、14 模板兼容状态、手动/兼容随机、穿搭随机/指定、分段提示词预览、试片和追溯记录。
- 新增 `wan3.0-video`，提供 TokenDance 与阿里云百炼两条独立额度路由。两条路由均支持首帧图生视频、480P/720P/1080P、2–30 秒和异步轮询。
- 新增简单参数区：模型、API 额度来源、时间、底图、数量、提示词补充、分辨率（默认 480P）。
- 豆包提交时强制在提示词开头写入所选时长。
- 新增 APIMart 监控底图加工：保留场景内容，改变为高位 45 度老式广角监控质感，每张图使用不同时间戳；完成后自动保存为新底图并进行视觉场景分析。
- API 密钥由 `secrets.js` 统一读取。macOS 使用钥匙串，Windows 安装脚本使用 DPAPI；项目和压缩包内不保存明文密钥。

## 已验证

- `npm test` 全部通过。
- 本地接口返回 14 个稳定动作 ID。
- Electron 44.4.5 可启动，桌面窗口成功加载本地工作台。
- 账号池右侧成功加载豆包网页，独立会话分栏可见。
- 没有执行远程视频生成或完整视频下载测试，避免触发此前的 VPN 断开问题。
- 已通过本地模拟响应验证 Wan3 提交载荷、首帧输入、参数边界、成功状态与结果 URL 映射；没有触发计费任务。

## 仍需真实环境验证

- 当前 `SCENE_ANALYSIS_MODEL=qwen3.7-flash`，需要用真实普通照片验证 APIMart 对该视觉模型和图片输入格式的兼容性。
- 用户给出的阿里云网关域名与官方文档的标准百炼域名不同；已按用户提供地址接入，需用该密钥做一次真实提交确认网关行为。
- Windows 上 Electron 账号会话与 DoubaoManager 自动任务桥接的真实账号协作。
- 豆包页面结构更新后，右侧网页本身仍可登录，但 DoubaoManager API 协议是否变化需按其上游版本检查。
- 系统 VPN/TUN 仍可能接管远程视频下载；不要把 HTTP 代理绕过等同于 VPN 绕过。

## 启动

- 桌面端：`npm run desktop`
- 浏览器端：`npm start`
- 测试：`npm test`
