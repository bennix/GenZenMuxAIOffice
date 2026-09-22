import { describe, expect, it, vi } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { history, undo } from '@tiptap/pm/history'
import type { Editor } from '@tiptap/core'
import {
  applyToneChanges,
  captureToneSource,
  detectTone,
  previewTone,
  toneCoverage,
  validateToneChanges,
} from './less-ai-tone'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 2 } } },
    blockquote: { content: 'block+', group: 'block' },
    codeBlock: { content: 'text*', group: 'block' },
    image: { inline: true, group: 'inline', atom: true },
    text: { group: 'inline' },
  },
  marks: { bold: {}, link: { attrs: { href: {} } } },
})
const paragraph = (text: string) => schema.node('paragraph', null, [schema.text(text)])
function editorFixture() {
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [
      schema.node('heading', null, [schema.text('原标题')]),
      schema.node('paragraph', null, [
        schema.text('说白了，预算可能不足。', [schema.mark('bold')]),
        schema.node('image'),
      ]),
      schema.node('codeBlock', null, [schema.text('说白了，代码不改。')]),
      schema.node('blockquote', null, [paragraph('说白了，引文不改。')]),
      schema.node('paragraph', null, [
        schema.text('链接文字', [schema.mark('link', { href: 'https://example.com' })]),
      ]),
    ]),
    plugins: [history()],
  })
  return {
    get state() {
      return state
    },
    schema,
    isEditable: true,
    view: {
      dispatch: (tr: Parameters<typeof state.apply>[0]) => {
        state = state.apply(tr)
      },
    },
  } as unknown as Editor
}
describe('less AI tone edits', () => {
  it('preserves formatting, protected objects, headings, and supports one undo', () => {
    const editor = editorFixture(),
      original = editor.state.doc
    const snapshot = captureToneSource(editor, 'document')
    expect(snapshot.segments.map((s) => s.text)).toEqual(['原标题', '说白了，预算可能不足。'])
    const changes = validateToneChanges(
      [{ id: 1, before: '说白了，', after: '', rule: 9 }],
      snapshot.segments,
    )
    applyToneChanges(editor, snapshot, changes)
    expect(editor.state.doc.child(1).firstChild?.text).toBe('预算可能不足。')
    expect(editor.state.doc.child(1).firstChild?.marks[0]?.type.name).toBe('bold')
    expect(editor.state.doc.child(1).lastChild?.type.name).toBe('image')
    expect(editor.state.doc.child(0).eq(original.child(0))).toBe(true)
    expect(editor.state.doc.child(2).eq(original.child(2))).toBe(true)
    expect(undo(editor.state, editor.view.dispatch)).toBe(true)
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it('captures only the selected part and rejects stale documents', () => {
    const editor = editorFixture()
    const all = captureToneSource(editor, 'document')
    const from = all.segments[1]!.from
    const snapshot = captureToneSource(
      editor,
      'selection',
      TextSelection.create(editor.state.doc, from, from + 4),
    )
    expect(snapshot.segments.map((s) => s.text)).toEqual(['说白了，'])
    editor.view.dispatch(editor.state.tr.insertText('新增', from))
    expect(() => applyToneChanges(editor, snapshot, [])).toThrow('文档已变化')
  })
  it('counts overlapping Unicode evidence only once and excludes whitespace', () => {
    const segments = [{ id: 0, from: 1, text: '甲乙 丙丁🙂', context: 'paragraph' }]
    expect(
      toneCoverage(segments, [
        { id: 0, quote: '甲乙', rule: 1 },
        { id: 0, quote: '乙 丙', rule: 2 },
      ]),
    ).toEqual({ matched: 3, total: 5, percent: 60 })
    expect(toneCoverage(segments, []).percent).toBe(0)
  })
  it('rejects invented evidence, altered facts, overlapping edits, and structural changes', async () => {
    const segments = [{ id: 0, from: 1, text: '说白了，可能提升 20%。', context: 'paragraph' }]
    await expect(
      detectTone(vi.fn().mockResolvedValue('[{"id":0,"quote":"不存在","rule":1}]'), segments, ''),
    ).rejects.toThrow('准确对应原文')
    for (const after of ['一定提升 20%。', '可能提升 99%。', '新段\n旧段', '<img>', ''])
      expect(() =>
        validateToneChanges([{ id: 0, before: segments[0]!.text, after, rule: 9 }], segments),
      ).toThrow()
    expect(() =>
      validateToneChanges(
        [
          { id: 0, before: '说白了', after: '其实', rule: 9 },
          { id: 0, before: '说白了，', after: '', rule: 9 },
        ],
        segments,
      ),
    ).toThrow('交叠')
  })
  it('uses the fixed skill and sends the actual selected preview for the second check', async () => {
    const segments = [{ id: 0, from: 1, text: '说白了，预算不足。', context: 'paragraph' }]
    const changes = validateToneChanges(
      [{ id: 0, before: '说白了，', after: '', rule: 9 }],
      segments,
    )
    const generate = vi.fn().mockResolvedValue('[]')
    await detectTone(generate, previewTone(segments, changes), '保留正式语体')
    expect(generate.mock.calls[0]![0].system).toContain('硬性边界')
    expect(JSON.parse(generate.mock.calls[0]![0].user).segments[0].text).toBe('预算不足。')
  })
})
