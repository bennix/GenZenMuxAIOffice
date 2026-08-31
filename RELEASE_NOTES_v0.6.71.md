# ZenOffice v0.6.71

## 跨平台打印与打印预览

- Word、Excel、PowerPoint、Markdown 和 PDF 均新增“打印预览…”入口。
- `⌘P` / `Ctrl+P` 调用 macOS、Windows 或 Linux 的系统原生打印面板。
- Excel 打印沿用工作表页面布局，支持打印区域、纸张方向、边距、缩放、网格线与行列标题。
- Markdown 打印复用 PDF 导出的分页 HTML，避免把编辑器工具栏和 AI 侧栏打印进去。
- PowerPoint 延续幻灯片、讲义与备注页打印，并处理 Windows 打印窗口焦点问题。
- PDF 先保存待处理修改，再以完整页面交给系统打印。

## Cross-platform print and preview

- Added Print Preview to Word, Excel, PowerPoint, Markdown, and PDF.
- `⌘P` / `Ctrl+P` opens the native print panel on macOS, Windows, and Linux.
- Excel honors print areas, orientation, margins, scaling, gridlines, and headings.
- Markdown reuses the PDF-export pagination path so editor chrome and AI panels are excluded.
- PowerPoint keeps slide, handout, and notes printing with Windows focus handling.
- PDF flushes pending edits before rendering complete pages for printing.

The full ZenMux AI, local RAG, academic review, citation, SQL, LaTeX, Mermaid, attachment, and @Connect workflows remain available.
