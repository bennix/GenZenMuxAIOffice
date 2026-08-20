import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'
import { BlockEquation, InlineEquation } from '../src/renderer/editor/equation'
import { repairOverescapedMarkdown } from '../src/renderer/markdown/docText'

function createEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, Markdown, InlineEquation, BlockEquation],
    content: '',
  })
}

describe('Markdown equation integration', () => {
  it('parses standard inline LaTeX delimiters into equation nodes', () => {
    const editor = createEditor()
    const parsed = editor.markdown!.parse(
      String.raw`图中的 $F_1$，重力 $G$，且 $F_1 = G \sin\theta$。`,
    )
    const paragraph = parsed.content?.[0]
    expect(paragraph?.content?.filter((node) => node.type === 'inlineEquation')).toEqual([
      { type: 'inlineEquation', attrs: { latex: 'F_1' } },
      { type: 'inlineEquation', attrs: { latex: 'G' } },
      { type: 'inlineEquation', attrs: { latex: String.raw`F_1 = G \sin\theta` } },
    ])
    editor.destroy()
  })

  it('round-trips inline and display equations as Markdown', () => {
    const editor = createEditor()
    editor.commands.setContent(
      String.raw`内联 $F_2 = G \cos\theta$。

$$
F_1 = f
$$`,
      { contentType: 'markdown' },
    )
    expect(editor.getMarkdown()).toContain(String.raw`$F_2 = G \cos\theta$`)
    expect(editor.getMarkdown()).toContain('$$\nF_1 = f\n$$')
    editor.destroy()
  })

  it('creates equation nodes from alternate LaTeX delimiters after normalization', () => {
    const editor = createEditor()
    const markdown =
      repairOverescapedMarkdown(String.raw`坐标 \(R_{t-1}\in\mathbb{R}^{N_q\times3}\)。
\[
R_t^{gt}=T_\theta R_{t-1}+t_{gt}
\]`)
    const parsed = editor.markdown!.parse(markdown)
    expect(parsed.content?.[0]?.content).toContainEqual({
      type: 'inlineEquation',
      attrs: { latex: String.raw`R_{t-1}\in\mathbb{R}^{N_q\times3}` },
    })
    expect(parsed.content?.[1]).toEqual({
      type: 'blockEquation',
      attrs: { latex: String.raw`R_t^{gt}=T_\theta R_{t-1}+t_{gt}` },
    })
    editor.destroy()
  })

  it('creates equation nodes from parenthesized @Connect formulas', () => {
    const editor = createEditor()
    const markdown = repairOverescapedMarkdown(
      String.raw`从 (N_q\times N_q\times C) 映射到 (G\in\mathbb{R}^{N_q\times d})，损失为 (\mathcal F(\hat b_t,b_t^{gt}))。`,
    )
    const parsed = editor.markdown!.parse(markdown)
    expect(parsed.content?.[0]?.content?.filter((node) => node.type === 'inlineEquation')).toEqual([
      { type: 'inlineEquation', attrs: { latex: String.raw`N_q\times N_q\times C` } },
      {
        type: 'inlineEquation',
        attrs: { latex: String.raw`G\in\mathbb{R}^{N_q\times d}` },
      },
      {
        type: 'inlineEquation',
        attrs: { latex: String.raw`\mathcal F(\hat b_t,b_t^{gt})` },
      },
    ])
    editor.destroy()
  })

  it('opens a saved review containing overescaped inline and block formulas', () => {
    const editor = createEditor()
    const markdown =
      repairOverescapedMarkdown(String.raw`第 3.2 节将关键点坐标定义为 (R\_{t-1}\\in\\mathbb{R}^{N\_q\\times3})，但式（13）写为
$$
R\_t^{gt}=T\_\\theta R\_{t-1}+t\_{gt},
$$
其中 (T\_\\theta\\in\\mathbb{R}^{3\\times3})。`)
    const parsed = editor.markdown!.parse(markdown)
    expect(parsed.content?.[0]?.content).toContainEqual({
      type: 'inlineEquation',
      attrs: { latex: String.raw`R_{t-1}\in\mathbb{R}^{N_q\times3}` },
    })
    expect(parsed.content?.[1]).toEqual({
      type: 'blockEquation',
      attrs: { latex: String.raw`R_t^{gt}=T_\theta R_{t-1}+t_{gt},` },
    })
    expect(parsed.content?.[2]?.content).toContainEqual({
      type: 'inlineEquation',
      attrs: { latex: String.raw`T_\theta\in\mathbb{R}^{3\times3}` },
    })
    editor.destroy()
  })

  it('parses a saved review display formula following a numbered item', () => {
    const editor = createEditor()
    const markdown = repairOverescapedMarkdown(String.raw`1. **式（13）存在错误。**
第 3.2 节定义为 (R\_{t-1}\\in\\mathbb{R}^{N\_q\\times3})，但写为
$$
R\_t^{gt}=T\_\\theta R\_{t-1}+t\_{gt},
$$
其中 (T\_\\theta\\in\\mathbb{R}^{3\\times3})。`)
    const parsed = editor.markdown!.parse(markdown)
    expect(JSON.stringify(parsed)).not.toContain('$$')
    expect(JSON.stringify(parsed)).toContain('blockEquation')
    editor.destroy()
  })

  it('renders opened Markdown equations with the same KaTeX DOM as AI replies', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: [StarterKit, Markdown, InlineEquation, BlockEquation],
      content: '',
    })
    editor.commands.setContent(
      repairOverescapedMarkdown(String.raw`内联 (R\_{t-1}\\in\\mathbb{R}^{N\_q\\times3})。
$$
R\_t^{gt}=T\_\\theta R\_{t-1}+t\_{gt}
$$`),
      { contentType: 'markdown' },
    )
    expect(element.querySelectorAll('.katex')).toHaveLength(2)
    expect(element.textContent).not.toContain('$$')
    editor.destroy()
    element.remove()
  })

  it('parses escaped review strengths as bold list-item prefixes', () => {
    const editor = createEditor()
    const markdown =
      repairOverescapedMarkdown(String.raw`- \*\*问题具有现实意义。\*\*将“一类一个模型”改为单模型多类别跟踪。
- \*\*整体组织较好。 \*\*引言与第 3 节对应。`)
    const parsed = editor.markdown!.parse(markdown)
    const json = JSON.stringify(parsed)
    expect(json).not.toContain('**')
    expect(json.match(/"type":"bold"/g)?.length).toBe(2)
    editor.destroy()
  })

  it('normalizes redundant inline dollar delimiters inside a display equation', () => {
    const editor = createEditor()
    const parsed = editor.markdown!.parse(String.raw`$$
$F_1 = 5\mathrm{N}$ < $f_{\max} = 8\mathrm{N}$
\boxed{f_1 = $F_1 = 5\mathrm{N}$}
$$`)
    expect(parsed.content?.[0]).toMatchObject({
      type: 'blockEquation',
      attrs: {
        latex: String.raw`F_1 = 5\mathrm{N} < f_{\max} = 8\mathrm{N}
\boxed{f_1 = F_1 = 5\mathrm{N}}`,
      },
    })
    editor.destroy()
  })

  it('preserves escaped dollar signs inside equation text', () => {
    const editor = createEditor()
    const parsed = editor.markdown!.parse(String.raw`$$
\text{Price: \$5}
$$`)
    expect(parsed.content?.[0]?.attrs?.latex).toBe(String.raw`\text{Price: \$5}`)
    editor.destroy()
  })
})
