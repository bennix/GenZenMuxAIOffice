# ZenOffice v0.6.79

## PPT AI 美化元素层级 / Reliable AI slide layers

- 修复 AI 美化后大背景、色块或卡片遮住文字、图片和其他小元素的问题。
- HTML 转换为可编辑 PPTX 时保留显式 CSS `z-index`，保证有意设计的图片蒙层与前景内容顺序不变。
- 未指定层级时，自动识别包含其他内容的大背景与嵌套卡片，并将它们移动到所承载内容下方。
- 自动排序只处理具有填充且包含其他对象的形状，不会按尺寸粗暴重排所有元素；不相关对象、图表和同尺寸图片蒙层保持原顺序。
- AI 页面生成提示同步要求按从背景到前景的顺序输出对象，并禁止大填充形状覆盖较小内容。

## 构建与验证 / Build and verification

- 新增可编辑 PPTX 往返测试，实际重新打开生成文件并检查背景、卡片、文字和图片的保存层级。
- Slides 类型检查、生产构建及完整测试通过。
- macOS 安装包使用 Developer ID Application 签名并完成 Apple 公证与装订。
- Windows x64、Ubuntu 22.04/24.04 DEB 与 Linux RPM 由 GitHub Actions 在对应平台构建并验证。

> AI 功能依赖 ZenMux 与相关网络服务，响应速度和可用性可能受当前网络状态影响。
