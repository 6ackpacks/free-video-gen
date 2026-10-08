# Content Pack 扩展约定

Content Pack 不只是提示词 Skill。它把一个视频类型的业务知识、执行方式、硬约束、人工审核和验证用例绑定在一起。

## 新增场景

1. 在 `content-packs/<pack-id>/pack.json` 新建内容包。
2. 选择现有 Engine：
   - `background-variants`：固定一张底图，替换人物与动作；
   - `reference-pairs`：每张参考图生成一个独立视频；
   - `timeline-story`：多镜头或完整短剧编排。
3. 填写 `navLabel`。工作台从 `GET /api/content-packs` 自动生成内容模板按钮，不需要手改导航。
4. 固定底图类型必须提供 `actionLibrary`，每个动作使用 Markdown frontmatter 声明人数、角色、必需场景标签、人物规则、画面规则与结束状态。
5. 将新场景的客观识别标签加入场景分析白名单。动作只能使用底图真实存在的空间与物件。
6. 为内容包增加测试：动作数量与 ID、角色人数、场景兼容、提示词硬约束和结束状态。
7. 先以 `status: draft` 登记；完成“一条提示词、一张图、一条试片”审核后改为 `active`，导航才会显示。

## 从参考视频复刻

参考视频不是直接变成一段长提示词，而是进入 Template Lab：

1. 保存用户 Brief 和参考视频来源；
2. 拆出场景事实、人物角色、动作节拍、镜头、声音和结束状态；
3. 标注哪些内容锁定、哪些是可变槽位；
4. 生成 `pack.json` 与动作 Markdown 草稿；
5. 人工确认后运行静态校验、成本预估和单条试片；
6. 通过后发布版本，任务记录 `packId + packVersion + promptVersion`。

因此模板拥有 Hypit 式的可编辑、可重跑工作流，同时比单一 Skill 多出：输入契约、场景证据、执行引擎、模型路由、审核门、版本、测试和任务血缘。
