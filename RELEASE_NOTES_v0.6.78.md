# ZenOffice v0.6.78

## PPT AI 美化方案 / Selectable AI slide beautification

- “AI 美化”改为先在侧边栏展示设计建议，用户选择后才重新排版当前幻灯片。
- 新增“清晰商务”“人文简约”“深色聚焦”三套方案，每套均提供字体、背景色、文字色与强调色的小型预览。
- 新增演讲大字模式；普通模式要求标题至少 36 pt、正文至少 24 pt，大字模式分别提高到 42 pt 与 28 pt。
- 修复原演示文稿字号偏小时，AI 美化继续沿用过小字号的问题；重新生成页面会使用最低字号保护。
- 字号检查现在识别 `px` 与 `pt`，并覆盖单一继承字号；未通过内容或可读性检查的页面会携带具体原因自动重试一次。

## 构建与验证 / Build and verification

- Slides TypeScript 类型检查通过。
- Slides 测试 389/389 通过，包括方案选择不修改文稿、字号下限和可读性审计回归测试。
- macOS 安装包使用 Developer ID Application 签名并完成 Apple 公证与装订。
- Windows x64、Ubuntu 22.04/24.04 DEB 与 Linux RPM 由 GitHub Actions 在对应平台构建并验证。

> AI 功能依赖 ZenMux 与相关网络服务，响应速度和可用性可能受当前网络状态影响。
