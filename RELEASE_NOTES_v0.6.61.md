## 主要更新

- Markdown 编辑器与 AI 回复统一使用同一套 KaTeX 渲染机制，并保留化学公式扩展支持。
- 打开已有 Markdown、粘贴、AI 回填和 `@Connect → Markdown` 统一经过共享规范化器。
- 修复列表正文之后的 `$$...$$` 多行块公式显示为源码的问题。
- 修复 `\*\*文字\*\*`、结束标记前空格、中文边界和多个相邻粗体片段导致的 Markdown 原样显示。
- 恢复 Word、Excel、Markdown 和 PDF 历史 AI 回复中的 `@Connect`，可继续发送到其他编辑器。
- PDF/Word/Excel/Markdown 的提问与回复复制、文件绑定历史及 ZenMux 通路保持不变。

## 验证

- 全项目类型检查、格式检查、Lint 和生产构建通过。
- electron-utils 110 项、UI 21 项、Markdown 124 项回归测试通过。
- 使用真实 `review.md` 的列表、粗体、内联公式和块公式结构进行回归验证。
- macOS DMG 使用 Developer ID 签名并完成 Apple 公证与 stapling。
- Windows 安装包暂未做 Authenticode 签名，SmartScreen 可能提示未知发布者。

AI 功能依赖网络，网络、代理或供应方响应状态可能影响完成时间。
