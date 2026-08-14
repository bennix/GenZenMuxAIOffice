import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { buildExtensions } from '../src/renderer/editor/extensions'
import {
  buildDocContext,
  captureAiSelection,
  executeTool,
  markDocSeen,
} from '../src/renderer/ai/tools'
import { deriveAutoFileName } from '../src/renderer/App'

// Undestroyed views leave DOMObserver flush timers that fire after jsdom teardown
// ("document is not defined" unhandled error) — destroy every editor we create.
const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
})

function createEditor(md = ''): Editor {
  const editor = new Editor({
    extensions: buildExtensions({
      slashController: {
        onOpen: () => {},
        onUpdate: () => {},
        onKeyDown: () => false,
        onClose: () => {},
      },
      slashItems: () => [],
    }),
    content: '',
  })
  if (md) editor.commands.setContent(md, { contentType: 'markdown' })
  editors.push(editor)
  return editor
}

const call = (name: string, input: Record<string, unknown> = {}) => ({
  id: 't1',
  name,
  input,
})

describe('get_document_context', () => {
  it('reports a blank document', () => {
    const editor = createEditor()
    expect(buildDocContext(editor)).toContain('The document is currently blank.')
  })

  it('lists numbered blocks with type and preview', () => {
    const editor = createEditor('# Title\n\nHello world.\n\n- a\n- b')
    const ctx = buildDocContext(editor)
    expect(ctx).toContain('0 | h1 | Title')
    expect(ctx).toContain('1 | paragraph | Hello world.')
    expect(ctx).toContain('2 | bulletList |')
  })

  it('reports the captured selection and its block range', () => {
    const editor = createEditor('# Title\n\nAlpha selected text omega.\n\nTail')
    const text = editor.state.doc.textContent
    const start = text.indexOf('selected')
    const paragraphStart = 1 + editor.state.doc.child(0).nodeSize
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(
          editor.state.doc,
          paragraphStart + start - 'Title'.length,
          paragraphStart + start - 'Title'.length + 8,
        ),
      ),
    )
    captureAiSelection(editor)
    const ctx = buildDocContext(editor)
    expect(ctx).toContain('User selection (default target; top-level blocks 1-1)')
    expect(ctx).toContain('selected')
  })
})

function selectText(editor: Editor, needle: string): void {
  let foundFrom = -1
  editor.state.doc.descendants((node, pos) => {
    if (foundFrom !== -1 || !node.isText || !node.text) return
    const index = node.text.indexOf(needle)
    if (index >= 0) foundFrom = pos + index
  })
  if (foundFrom < 0) throw new Error(`Text not found: ${needle}`)
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, foundFrom, foundFrom + needle.length),
    ),
  )
}

describe('selection-anchored AI tools', () => {
  it('precisely replaces selected text inside a paragraph', () => {
    const editor = createEditor('Before old words after.')
    selectText(editor, 'old words')
    captureAiSelection(editor)
    const result = executeTool(editor, call('replace_selection', { markdown: '**new words**' }))
    expect(result.isError).toBeUndefined()
    expect(editor.getMarkdown()).toContain('Before **new words** after.')
  })

  it('inserts content after the selected block', () => {
    const editor = createEditor('# A\n\nAnchor paragraph.\n\nTail paragraph.')
    selectText(editor, 'Anchor')
    captureAiSelection(editor)
    const result = executeTool(
      editor,
      call('insert_near_selection', { position: 'after', markdown: 'AI addition.' }),
    )
    expect(result.isError).toBeUndefined()
    const md = editor.getMarkdown()
    expect(md.indexOf('AI addition.')).toBeGreaterThan(md.indexOf('Anchor paragraph.'))
    expect(md.indexOf('AI addition.')).toBeLessThan(md.indexOf('Tail paragraph.'))
  })

  it('requires a captured selection', () => {
    const editor = createEditor('No selection.')
    expect(executeTool(editor, call('replace_selection', { markdown: 'x' })).isError).toBe(true)
    expect(
      executeTool(editor, call('insert_near_selection', { position: 'after', markdown: 'x' }))
        .isError,
    ).toBe(true)
  })

  it('rejects an anchored edit if the user changed the document after capture', () => {
    const editor = createEditor('Selected words.')
    selectText(editor, 'Selected')
    captureAiSelection(editor)
    markDocSeen(editor)
    editor.commands.insertContentAt(editor.state.doc.content.size, ' user edit')
    const result = executeTool(editor, call('replace_selection', { markdown: 'Changed' }))
    expect(result.isError).toBe(true)
    expect(result.output).toContain('changed')
  })
})

describe('insert_content', () => {
  it('replaces the empty paragraph on a blank document', () => {
    const editor = createEditor()
    const result = executeTool(
      editor,
      call('insert_content', { afterIndex: -1, markdown: '# Hi\n\nBody.' }),
    )
    expect(result.isError).toBeUndefined()
    expect(result.mutated).toBe(true)
    expect(editor.getMarkdown()).toContain('# Hi')
    expect(editor.state.doc.childCount).toBe(2)
  })

  it('inserts after the given block', () => {
    const editor = createEditor('# A\n\nfirst')
    executeTool(editor, call('insert_content', { afterIndex: 0, markdown: 'inserted' }))
    const md = editor.getMarkdown()
    expect(md.indexOf('inserted')).toBeGreaterThan(md.indexOf('# A'))
    expect(md.indexOf('inserted')).toBeLessThan(md.indexOf('first'))
  })

  it('rejects an out-of-range index', () => {
    const editor = createEditor('# A')
    const result = executeTool(editor, call('insert_content', { afterIndex: 9, markdown: 'x' }))
    expect(result.isError).toBe(true)
  })
})

describe('model output is sanitized to pure GFM', () => {
  it('raw HTML in tool input degrades to plain text', () => {
    const editor = createEditor()
    executeTool(
      editor,
      call('insert_content', {
        afterIndex: -1,
        markdown: '<p style="text-align: center"><span style="color: red">note</span> here</p>',
      }),
    )
    const md = editor.getMarkdown()
    expect(md).toContain('note here')
    expect(md).not.toContain('<')
  })

  it('legacy ::: fenced divs in tool input are stripped, keeping the body', () => {
    const editor = createEditor()
    executeTool(
      editor,
      call('insert_content', {
        afterIndex: -1,
        markdown: ':::callout {type="warning"}\nBe careful.\n:::',
      }),
    )
    const md = editor.getMarkdown()
    expect(md).toContain('Be careful.')
    expect(md).not.toContain(':::')
  })

  it('repairs overescaped model Markdown and renders its equations', () => {
    const editor = createEditor()
    executeTool(
      editor,
      call('insert_content', {
        afterIndex: -1,
        markdown:
          '\\* 判断碰撞速度：\n\n速度 $v = \\\\sqrt{2gh}$，死者是\\*\\*直接砸向地面\\*\\*。',
      }),
    )
    const json = editor.getJSON()
    const serialized = JSON.stringify(json)
    expect(serialized).toContain('inlineEquation')
    expect(serialized).toContain('v = \\\\sqrt{2gh}')
    expect(serialized).toContain('bold')
    expect(editor.getMarkdown()).toContain('**直接砸向地面**')
  })
})

describe('replace_blocks', () => {
  it('rewrites a block range', () => {
    const editor = createEditor('# A\n\nold text\n\nkeep me')
    const result = executeTool(
      editor,
      call('replace_blocks', { startIndex: 1, endIndex: 1, markdown: 'new text' }),
    )
    expect(result.mutated).toBe(true)
    const md = editor.getMarkdown()
    expect(md).toContain('new text')
    expect(md).not.toContain('old text')
    expect(md).toContain('keep me')
  })

  it('deletes a range with empty markdown', () => {
    const editor = createEditor('# A\n\ndelete me\n\nkeep me')
    executeTool(editor, call('replace_blocks', { startIndex: 1, endIndex: 1, markdown: '' }))
    const md = editor.getMarkdown()
    expect(md).not.toContain('delete me')
    expect(md).toContain('keep me')
  })

  it('deleting every block leaves an empty paragraph', () => {
    const editor = createEditor('# A\n\nb')
    executeTool(editor, call('replace_blocks', { startIndex: 0, endIndex: 1, markdown: '' }))
    expect(editor.state.doc.childCount).toBe(1)
  })
})

describe('staleness guard', () => {
  it('refuses index writes after a user edit and recovers via get_document_context', () => {
    const editor = createEditor('# A')
    markDocSeen(editor)
    // simulate a user edit after the AI last saw the doc
    editor.commands.insertContentAt(editor.state.doc.content.size, 'user typed')
    const blocked = executeTool(editor, call('insert_content', { afterIndex: 0, markdown: 'x' }))
    expect(blocked.isError).toBe(true)
    expect(blocked.output).toContain('changed')
    executeTool(editor, call('get_document_context'))
    const ok = executeTool(editor, call('insert_content', { afterIndex: 0, markdown: 'x' }))
    expect(ok.isError).toBeUndefined()
  })
})

describe('read_blocks paging', () => {
  it('pages long output with a continue notice', () => {
    const editor = createEditor(`# T\n\n${'lorem ipsum '.repeat(3000)}`)
    const result = executeTool(editor, call('read_blocks', { startIndex: 0, endIndex: 1 }))
    expect(result.output).toContain('continue with offset=')
    const offset = Number(/offset=(\d+)/.exec(result.output)![1])
    const rest = executeTool(editor, call('read_blocks', { startIndex: 0, endIndex: 1, offset }))
    expect(rest.output.length).toBeGreaterThan(0)
  })
})

describe('deriveAutoFileName', () => {
  it('uses the first heading', () => {
    const editor = createEditor('# 阿里巴巴集团介绍\n\nbody')
    expect(deriveAutoFileName(editor)).toBe('阿里巴巴集团介绍')
  })

  it('falls back to the first words of a paragraph', () => {
    const editor = createEditor('just some plain opening words here to use\n\nmore')
    expect(deriveAutoFileName(editor)).toBe('just some plain opening words here to use')
  })

  it('returns empty for a blank document', () => {
    const editor = createEditor()
    expect(deriveAutoFileName(editor)).toBe('')
  })
})
