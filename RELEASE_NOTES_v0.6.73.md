# ZenOffice v0.6.73

## 旧版 Word 保真转换与自动安装

- Word、统一 Shell、Finder/Explorer 文件关联均可识别 `.doc`、`.docx`、OLE、OOXML 与 Word HTML 容器。
- `.doc ↔ .docx` 使用 LibreOffice 做真实 Word 97/OOXML 转换；转换副本不会覆盖源文件。
- 保真转换不可用时不再静默退化为纯文本，避免字体、字号、颜色、表格和分页被打乱。
- 缺少 LibreOffice 时可从提示框启动平台安装流程：macOS/Homebrew、Windows/winget、Ubuntu/Debian/apt、Fedora/RHEL/dnf 或 yum、Arch/pacman。
- 安装窗口显示真实命令、PID、标准输出/错误输出、阶段、百分比和耗时；安装完成后自动继续打开文档。

## AI 信息图、科研审稿与作文评阅

- Word、Excel、PowerPoint 与 Markdown 新增明显的信息图入口，可将当前内容或选区交给 AI 生成可编辑信息图；Excel 图表入口也可直接转入信息图工作流。
- 严格 AI 审稿委员会可调用真实学术检索结果，核验相关工作并评估创新性、证据强度与引用可靠性。
- Word 与 Markdown 新增中文和英语作文评价、评分与润色入口，覆盖中考、高考、作文竞赛、大学中文、初高中英语、CET4/CET6、TOEFL、IELTS 与 GRE。

## 构建可靠性与渲染修复

- Sheets 原生 Rust 构建器可在 Xcode、Codex 和旧终端 PATH 不完整时主动发现 Cargo。
- Markdown/AI 内容处理进一步修正零星代码块和富文本渲染问题。
- LibreOffice 安装日志页增加脚本语法回归测试，防止出现空白日志或计时停滞。

## Legacy Word fidelity and guided installation

- Word, the unified shell, and Finder/Explorer associations now recognize `.doc`, `.docx`, OLE, OOXML, and Word HTML containers.
- Real Word 97/OOXML conversion uses LibreOffice and never overwrites the source document.
- ZenOffice no longer silently falls back to text-only recovery when fidelity conversion is unavailable.
- The guided installer uses the native package manager on macOS, Windows, Ubuntu/Debian, Fedora/RHEL, and Arch Linux.
- A live progress window shows the command, PID, stdout/stderr, stage, percentage, and elapsed time, then resumes opening the document automatically.

## AI infographic, research review, and writing assessment

- Word, Excel, PowerPoint, and Markdown gain prominent AI-linked infographic workflows; Excel chart creation can enter the same editable infographic studio.
- The strict multi-agent review committee can use verified literature search evidence to assess novelty and citation reliability.
- Word and Markdown add Chinese and English composition scoring, critique, and polishing across school, university, CET, TOEFL, IELTS, and GRE levels.

## Build and rendering reliability

- The Sheets native build locates Cargo even when launched from a GUI or a stale terminal PATH.
- Markdown/AI ingestion receives additional code-block and rich-text rendering fixes.
- Installer-page JavaScript now has regression coverage so command logs and elapsed time cannot silently disappear.
