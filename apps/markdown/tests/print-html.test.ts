import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'
import { InlineEquation, BlockEquation } from '../src/renderer/editor/equation'
import { repairOverescapedMarkdown } from '../src/renderer/markdown/docText'
import { buildPrintHtml } from '../src/renderer/export/printHtml'

describe('printable equations', () => {
  it('exports list arrows and display equations as self-contained MathML', () => {
    const editor = new Editor({
      extensions: [StarterKit, Markdown, InlineEquation, BlockEquation],
      content: '',
    })
    try {
      editor.commands.setContent(
        repairOverescapedMarkdown(String.raw`- \[ \] 输入处理 $\\to$ 核心变换 $\\to$ 输出返回。

$$
\frac{a_1}{b^2} + \sqrt{x}
$$`),
        { contentType: 'markdown' },
      )
      // Exercise both live NodeViews and serialized HTML (source-only equation nodes).
      const serialized = document.createElement('div')
      serialized.innerHTML = editor.getHTML()
      for (const root of [editor.view.dom, serialized]) {
        const output = new DOMParser().parseFromString(buildPrintHtml(root, 'Doc'), 'text/html')
        expect(output.querySelectorAll('math')).toHaveLength(3)
        expect(output.querySelector('mfrac')).not.toBeNull()
        expect(output.querySelector('msqrt')).not.toBeNull()
        expect(output.body.textContent).toContain('→')
        expect(output.body.textContent).not.toContain('$')
        expect(output.body.textContent).not.toContain('\\to')
        expect(output.querySelector('.katex-html, annotation')).toBeNull()
      }
      // Printing must not replace the editable equations in the live document.
      expect(editor.view.dom.querySelectorAll('.katex')).toHaveLength(3)
      expect(editor.getMarkdown()).toContain(String.raw`$\to$`)
    } finally {
      editor.destroy()
    }
  })
})
