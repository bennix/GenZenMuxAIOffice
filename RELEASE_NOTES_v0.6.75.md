# ZenOffice v0.6.75

## 应用语言同步 / Application language synchronization

- Word、Excel、PowerPoint、Markdown 与 PDF 的新增功能现在统一订阅“设置 → 通用语言”，切换语言后无需依赖操作系统语言即可同步更新。
- 信息图工作室的标题、结构、风格、模板、主题、AI 操作、本地渲染说明和示例内容覆盖全部 19 种应用语言。
- AI 审稿、作文评阅、科研文献、翻译、图表、微信排版、SQL 数据库和数据分析等新增入口已补齐多语言文案。
- `@Connect`、公式图片识别、剪贴板错误与空状态提示统一接入当前应用语言。
- 修复 Word、Excel、PowerPoint 首次启动时模块语言未与通用设置同步的问题。
- 参考文献管理器不再读取操作系统语言，由当前编辑器显式传入应用语言。

## 验证 / Verification

- UI、Word、Excel、PDF、Markdown 与 Excel 原生引擎测试通过。
- 相关 workspace TypeScript 类型检查通过。
- Word、Excel、PowerPoint、PDF、Markdown 生产构建通过。
- 渲染端已无 `navigator.language` / `navigator.languages` 残留。

> AI 功能依赖 ZenMux 与相关网络服务，响应速度和可用性可能受当前网络状态影响。
