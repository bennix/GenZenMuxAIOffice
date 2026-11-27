## ZenOffice v0.6.108

- 修复 Word 文稿混合单栏、双栏时的显示及打印预览布局。
- 改善旧 MathType/WMF 公式的尺寸、文字定位、括号、分数线与编号显示。
- 旧公式复用系统公式编辑器，支持原图预览、LaTeX 编辑及 AI 图片识别。
- 转换前必须确认：保存并重新打开后无法还原原 MathType 嵌入对象，请保留原文件。
- 公式可作为图片加入 AI 提问草稿，同时附上文稿名、章节标题、编号、当前段落及前后各两段；用户确认后发送。
- 保留既有 PDF、Markdown、PPT、表格和 MCP 功能。

验证：Docs 773 项单元测试通过；DOCX 引擎 553 项通过、1 项跳过；类型检查与修改文件 lint 通过。Electron 端到端测试验证公式图片与上下文附件、转换确认、保存重开和原生公式截图。测试不调用真实 AI。

发布验证：Windows、DEB/AppImage、RPM 的独立构建、包校验与附件上传通过。macOS Apple Silicon 与 Intel 应用及 DMG 全部通过 Apple 公证，签名、票据和 Gatekeeper 检查通过；Apple Silicon 打包应用已启动验证。更新 ZIP 的 GitHub SHA-256 与本地一致，自动更新清单按最终安装包复核。Windows 安装包未签署 Authenticode。

公证提交：Apple Silicon 应用 `b0d2291e-9c60-43ce-a630-b1ef6e08684a`、Intel 应用 `bccfad6e-0d82-48bc-bcf7-1c93399cd008`、Apple Silicon DMG `07208014-5946-4d62-bf24-e8bc4bd10ae1`、Intel DMG `171e4fe2-d502-4c35-a363-63d1ae0cd21d` 均为 Accepted。
