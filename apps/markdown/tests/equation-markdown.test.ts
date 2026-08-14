import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'
import { BlockEquation, InlineEquation } from '../src/renderer/editor/equation'

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
})
