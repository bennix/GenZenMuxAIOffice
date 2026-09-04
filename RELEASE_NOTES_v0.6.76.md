# ZenOffice v0.6.76

## 已打开文件作为 AI 上下文 / Open-file AI context

- Word、Excel、PowerPoint、Markdown 与 PDF 的 AI 输入框支持键入 `@`，选择 ZenOffice 中其他已打开且已保存的文件。
- 被引用文件进入现有本地附件解析与最多 5 个附件的上下文通路；未保存草稿和当前活动文件不会出现在候选列表中。
- 文件候选、空状态和失败提示跟随“设置 → 通用语言”，覆盖全部 19 种应用语言。
- Shell 端校验请求来源，只向所属编辑器返回可信的已打开文件路径。

## PowerPoint 字号与可编辑回填 / PowerPoint typography fidelity

- AI 重生成会读取当前演示文稿的典型正文字号和最大标题字号，并将其作为排版锁传给生成流程。
- 修复样式写回把 `shrink-to-fit` 后的显示字号误当成设计字号的问题，避免字号逐次变小。
- 用户明确修改字号时，清理旧的自动缩放比例和行距压缩信息，使新字号在 PPTX 中真实生效。
- 可编辑 HTML 生成不再强制使用可能缩小文字的 `fit: shrink`。

## 验证 / Verification

- 全部 workspace TypeScript 类型检查通过。
- Electron 工具 114/114、共享 UI 28/28、Shell 148/148、PowerPoint 387/387 测试通过。
- 格式检查与 `git diff --check` 通过。

> AI 功能依赖 ZenMux 与相关网络服务，响应速度和可用性可能受当前网络状态影响。
