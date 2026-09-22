# ZenOffice v0.6.80

## PPTX 跨软件兼容性 / Office suite compatibility

- 修复 ZenOffice 生成或保存的 PPTX 在微软 Office、WPS、LibreOffice 中显示整份空白页的问题。
- 保存到磁盘时生成带完整 CRC 与大小信息的 ZIP 条目头，避免部分办公软件拒绝读取使用数据描述符的 PPTX。
- 自动检查并补全 OOXML 中未绑定的 `a:`、`r:` 和 `p:` 命名空间，同时保留原文件中有效的局部声明。
- 修复同时覆盖普通保存、另存为、AI 生成和 AI 美化后的演示文稿。

## 验证 / Verification

- 使用用户提供的 25 页《第 02 周 Python 快速入门》复现并验证：修复后全部 XML 合法，LibreOffice 可读取并将 25 页完整导出为 PDF，每页均含可见内容。
- PPTX 引擎完整测试、类型检查、生产构建及多平台安装包工作流通过。
- macOS 安装包使用 Developer ID Application 签名，并完成 Apple 公证与装订。

> AI 功能依赖 ZenMux 与相关网络服务，响应速度和可用性可能受当前网络状态影响。
