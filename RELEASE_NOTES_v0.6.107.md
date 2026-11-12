## ZenOffice v0.6.107

- 修复 macOS 兼容模式下，包含 JPEG 2000 图片的 PDF 教材封面和页面长时间空白的问题。
- 兼容模式改用主进程 PDFium 渲染页面与缩略图，保留 PDF.js 文字选择层；渲染失败时回退到 PDF.js。
- 页面加载期间显示提示，失败时明确告知，避免静默空白。
- 保留 macOS 启动兼容措施。

验证：真实 118 页教材的第 1、2、3、11 页渲染通过；封面测试约 2.8 秒。PDF 模块 396 项测试及类型检查通过。测试资料不随源码发布。

补充验证：全工作区类型检查、生产构建与 preload 检查通过；单元测试通过（本机 Node 测试关闭实验性 Web Storage，避免与 jsdom 冲突）。已直接启动签名后的 Apple Silicon 应用验证教材封面。

检查说明：全仓库 CI lint 仍有 3 处既有问题（Sheets/Shell 未使用导入、Slides prefer-const），不属于本次 PDF 修改；本次修改的文件 lint 通过。

云端集成检查：57 项通过、2 项跳过，另有 3 项未通过（关于页自动更新、MCP 写作上下文、Slides 兼容导出）。这三项在上一版主线 CI（run 42977977285）中也失败，并非本次新增；全仓库 CI 尚未全绿。Windows、Linux RPM、DEB/AppImage 的独立构建与包校验均通过。

发布验证：macOS Apple Silicon 与 Intel 应用及 DMG 均已通过 Apple 公证；签名、公证票据和 Gatekeeper 检查通过，两个架构的更新 ZIP 与 SHA-512 清单一致。Windows 安装包未签署 Authenticode。
