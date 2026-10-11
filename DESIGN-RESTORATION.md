# 帧间前端与交互设计还原交付

2026-10-12，在现有平台上对照交付包的14张设计图重做前端与交互，保留真实生成链路与历史数据。

侧栏、标题、卡片、颜色、间距、图片区域、选中状态、右侧编辑抽屉、固定操作栏和独立底图准备页已按参考图调整。静态场景示例来自用户提供的设计图；实际素材和作品使用本地真实记录。设计图片不冒充已生成视频。

## 逐页交付

| 页面 | 参考图片 | 实际路由/入口 | 代码 | 接口对接 | 本次核对 |
|---|---|---|---|---|---|
| 制作台首页 | 01_制作台首页.png | /studio | studio-ui.js / studio-ui.css | /api/studio | 四场景入口、搜索、最近项目已核对 |
| 足浴模板制作 | 02_足浴模板制作.png | /studio?scene=footspa | studio-ui.js / studio-ui.css | /api/studio/projects | 5+3+2=10；共用底图确认后10条就绪 |
| 按摩模板制作 | 03_按摩模板制作.png | /studio?scene=massage | studio-ui.js / home-massage/pack.json | /api/studio/projects | 六类新模板；3+2=5默认需5张底图 |
| KTV模板制作 | 04_KTV模板制作.png | /studio?scene=ktv | studio-ui.js / studio-ui.css | /api/studio/projects | 多选；只展开选中卡片设置 |
| 短剧宣传模板制作 | 05_短剧宣传模板制作.png | /studio?scene=story | studio-ui.js / studio-domain.js | /api/story-subjects / /api/studio/projects | 引用真实品牌；多选；先生成并确认脚本 |
| 模板内容编辑侧栏 | 06_模板内容编辑侧栏.png | 制作页 → 编辑内容 | studio-ui.js / studio-ui.css | /api/studio/templates / /api/studio/projects | 右侧抽屉、动作增删排序、本次应用/另存 |
| AI底图生成与确认 | 07_AI底图生成与确认.png | 制作页 → 准备底图 | studio-ui.js / studio-domain.js | /api/studio/image-tasks / /api/studio/assets | 四来源、大图、重做/替换、映射确认、刷新恢复 |
| 爆款复刻 | 08_爆款复刻.png | /replicate | replica-design.js / replica-design.css / replica-ui.js | /api/replica-analysis / /api/replica-presets | 内容替换→策划确认→试片/批量；专业信息折叠 |
| 模板中心 | 09_模板中心.png | /templates | studio-ui.js / studio-ui.css | /api/studio/templates | 场景与来源筛选、编辑/另存/归档；不同场景交错展示 |
| 我的素材 | 10_我的素材.png | /assets | studio-ui.js / studio-ui.css | /api/studio/assets | 真实素材、多选工具栏、可点击菜单、查看大图 |
| 我的作品按模板分组 | 11_我的作品按模板分组.png | /works | studio-ui.js / studio-ui.css | /api/studio/works | 真实状态；按模板/项目折叠；筛选和展开保留 |
| 作品预览与追溯 | 12_作品预览与追溯.png | /works?video=<任务ID> | studio-ui.js / studio-ui.css | /api/video/<ID> | 真实15.072秒成片readyState=4；返回原搜索和分组 |
| 豆包账号池 | 13_豆包账号池.png | /accounts | studio-ui.js / studio-ui.css | /api/doubao / /api/studio/works | 真实5账号/0忙碌；任务列表、账号查看和调度开关 |
| 设置与连接配置 | 14_设置与连接配置.png | /settings | studio-ui.js / studio-ui.css | 现有连接配置与connection-test接口 | 三页签、服务卡片、掩码密钥、折叠高级设置、保存/取消 |

## 验证与实际范围

- 构建通过：77个JavaScript文件、HTML静态资源及3个内容包。
- 102项自动化测试全部通过。覆盖独立数量/时长、自定义映射、按摩一对一底图、模板版本隔离、试片采用后补剩余槽位、无账号保留队列、幂等提交、短剧确认前阻止提交、字幕输出和媒体范围请求。
- 浏览器核对足浴5+3+2=10、按摩3+2=5需5张底图，素材大图、四来源底图页、抽屉关闭、复刻策划确认、设置页签及真实成片预览。作品详情返回后保留“双房同物疑云”搜索及展开组。
- 700px窄屏检查：制作台、作品列表及按摩页没有横向溢出；模板网格588px单列，抽屉615px未越界；导航补充可访问名称。固定操作栏留出底部空间。
- 新增草稿恢复测试：底图准备阶段、当前模板、共用底图和场景/人物/姿态/补充描述在重载后保留。

本次浏览器验证没有发起新的付费图像或视频任务。字幕、下载、调度及试片抵扣由现有行为测试验证；不能据此声称所有外部服务均已完成真实新生成验收。没有进行自动逐像素差异测量，因此不宣称视觉达到100%像素一致。真实数据、浏览器宽度及文档优先规则使部分卡片数值和排列与示例不同。

## 数据保留与回退

本次没有删除或重写历史作品、素材或账号。新增按摩模板追加登记，原模板ID继续保留；项目中保存模板快照。素材选择引用原ID，不重复复制。底图准备的页面状态和配置写入原项目记录。

回退前先备份本机data目录与本机服务配置，再回退本次代码提交并重启；保留此前的一期数据库备份与原数据ID。密钥仍由现有Windows加密存储负责，不进入前端和提交文件。回退前确认没有正在执行的外部任务。


## 2026-10-12 配色与样式统一

参考 MotionSites、GSAP Showcase / Accessible Animation 和 Awwwards 官方案例 / Mobile Excellence Guidelines。将界面品牌色从绿色改为石墨灰导航、中性灰白底与蓝色强调（#4160D9），统一四份样式表的颜色变量、字体、边框、表单和交互反馈。重复的模板使用按钮降为次级样式，同行卡片等高，选中边框固定1px。筛选栏回归文档流；长素材名省略显示，菜单不被卡片裁切。390px底图按钮可换行，底图和成片预览采用单列；减少动态的系统设置会关闭装饰过渡。

浏览器验证1280px与1672px首页卡片尺寸一致；390px页面无整页横向溢出，抽屉宽370.5px。真实15.072秒成片预览可用，作品返回保留筛选和展开状态。构建通过，102项行为测试通过。本轮没有新增付费生成请求。
