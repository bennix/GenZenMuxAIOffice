# ZenOffice v0.6.81

## PowerPoint 打印与 PDF 导出 / PowerPoint printing and PDF export

- 修复图片较多或页数较长的 PPT 打印预览失败，并显示 `ERR_INVALID_URL (-300)` 的问题。
- PPT 打印与 PDF 导出现在通过受控的临时 HTML 文件加载页面，避免把整份演示文稿编码到超长 Chromium URL 中。
- 打印或导出结束后自动删除临时内容；加载失败时同样完成清理。
- Word 与 PDF 的现有打印测试继续通过；Excel 与 Markdown 已使用相同的本地临时文件方案，不受此 URL 长度问题影响。

## 验证 / Verification

- 在真实 Electron 环境中确认旧方案对大型 HTML 返回 `ERR_INVALID_URL`，修复后同一内容可完整加载，并成功导出 25 页 PDF。
- PowerPoint 打印临时文件测试、类型检查、生产构建以及 Word/PDF 打印回归测试通过。

> AI 功能依赖 ZenMux 与相关网络服务，响应速度和可用性可能受当前网络状态影响。
