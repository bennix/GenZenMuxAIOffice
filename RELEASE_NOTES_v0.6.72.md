# ZenOffice v0.6.72

## AI 幻灯片投影可读字号

- AI 新建与重做的幻灯片采用更清晰的字号层级：封面标题 44–54pt、页面标题 34–42pt、正文 21–28pt。
- 正文原则上不低于 20pt；图表标签、图注、页脚和页码保留独立的小字号范围。
- 内容页通常控制在 3–5 个要点；内容过密时优先精简层级或拆页，不再通过缩小字体硬塞。
- 新增生成页面字号质量检查：页面整体字号中位数低于约 20pt 时会被标记并要求重做。
- AI 输出仍然落为可编辑的 PPTX 文字框、形状、表格、图表和图片对象，不会扁平化为整页图片。

## Projection-readable AI slides

- New and regenerated slides now use a clearer type scale: 44–54pt cover titles, 34–42pt page titles, and 21–28pt body copy.
- Ordinary body copy should remain at or above 20pt, while labels, captions, footers, and page numbers keep dedicated smaller ranges.
- Content slides normally use three to five concise points; dense material is tightened or split instead of forced into tiny text.
- A new typography audit flags generated pages whose median declared size would land below roughly 20pt and asks the AI to redo them.
- Generated content remains editable native PPTX text boxes, shapes, tables, charts, and image objects rather than flattened slide images.

All existing ZenMux AI, local RAG, academic review, citation, SQL, LaTeX, Mermaid, attachment, @Connect, and cross-platform print workflows remain available.
