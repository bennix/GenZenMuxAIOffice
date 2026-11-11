## ZenOffice v0.6.105

- 去 AI 味改为三步向导，内置日常文章、论文、摘要、审稿回复和研究申请模板；高级参数默认收起。
- 完整接入 Academic Humanizer v0.3.3 六层规则：审查原文及证据、作者补充、改写、修改报告、逐条确认应用。保留中英文原文语言，并拦截数字及常见公式和引用标记变化。
- 学术评审和作文评价改为模板选择、确认开始、报告审阅；默认沿用已配置模型，角色模型配置放入高级选项。
- Word 与 Markdown 复用现有去 AI 味入口。中文润色先预览建议，确认后写回。

模型给出的证据判断和学术结论仍需作者核对。界面与程序测试不代表真实论文的模型效果验收。

验证：全工作区类型检查、生产构建及 preload 自包含检查通过。工作区测试通过（Slides 等采用 Node Web Storage 兼容参数）；Word 和 Markdown 的分步操作、修改应用及撤销端到端测试通过。

平台：macOS Apple Silicon / Intel、Windows x64、Linux DEB / RPM / AppImage。

macOS 两种架构的应用和 DMG 均通过 Developer ID 签名、Apple 公证、票据校验及 Gatekeeper 检查。Windows 和 Linux 安装包通过各自构建流水线验证；Windows 安装包未做 Authenticode 签名。
