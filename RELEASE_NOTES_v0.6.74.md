# ZenOffice v0.6.74

## 可编辑信息图与翻译界面修复

- Word 翻译功能区在切换选项卡时自动回到左侧起点，翻译入口与目标语言不再被残留横向滚动位置遮挡。
- Markdown 信息图双击后可编辑真实 AntV 源码；点击图形外部或“预览”会立即恢复渲染结果。
- Markdown 信息图的“AI 修改”使用 ZenMux 通路生成 AntV 语法，不再误用 Mermaid 生成链路。
- Word、Excel 和 PowerPoint 保存信息图时同时保留高清 PNG 与可编辑 AntV 源码。
- 重新打开 DOCX、XLSX 或 PPTX 后，双击信息图即可继续编辑或通过 ZenMux AI 修改，并原位替换，保留尺寸、位置以及对应文档对象属性。
- Unicode 中文、公式符号和百分号等内容可安全写入 OOXML 元数据并完整恢复。

## 构建与验证

- macOS Apple Silicon DMG 使用 Developer ID 签名并提交 Apple 公证，同时提供自动更新 ZIP。
- Windows x64 使用原生 GitHub Actions runner 构建 NSIS 安装程序。
- Ubuntu 22.04 runner 构建兼容 Ubuntu 22.04/24.04 的 amd64 DEB。
- Rocky Linux 9 容器构建 Fedora/RHEL/Rocky/Alma/openSUSE 可用的 x86_64 RPM。

## Editable infographics and translation UI fixes

- The Word translation ribbon resets its horizontal position when tabs change, keeping translation controls and target languages fully visible.
- Markdown infographics return to their rendered preview when source editing loses focus or the user selects Preview.
- Infographic AI modification now uses the ZenMux AntV syntax workflow instead of the Mermaid generator.
- Word, Excel, and PowerPoint persist both the rendered PNG and editable AntV source in DOCX, XLSX, and PPTX.
- Reopened infographics can be double-clicked, edited, revised through ZenMux AI, and replaced in place while retaining their existing frame and position.
- Unicode CJK text, mathematical symbols, and percent values round-trip safely through OOXML metadata.
