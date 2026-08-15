import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { parseDocx, saveDocx } from '@genoffice/docx-engine'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  buildDocx,
  IMAGE_PARAGRAPH_XML,
} from '../../../packages/docx-engine/tests/helpers/build-docx'
import { blocksToPmDoc, pmDocToSavePlan, type PmNode } from '../src/renderer/editor/convert'
import { editorExtensions } from '../src/renderer/editor/extensions'

async function openImageDoc(extraRels?: string) {
  const source = await buildDocx({ bodyXml: IMAGE_PARAGRAPH_XML, withImage: true, extraRels })
  const parsed = await parseDocx(source)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: blocksToPmDoc(parsed.blocks) as never,
  })
  return { editor, parsed, source }
}

describe('image wrap in the editor', () => {
  it('keeps an untouched image byte-identical', async () => {
    const { editor, parsed, source } = await openImageDoc()
    const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
    expect(plan.changedCount).toBe(0)
    expect(await saveDocx(parsed, plan.saveBlocks)).toEqual(source)
    editor.destroy()
  })

  it('replaces existing picture bytes at the original relationship and media path', async () => {
    const { editor, parsed } = await openImageDoc(
      '<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/stale.png"/>',
    )
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    const replacement = Buffer.from('replacement-picture-bytes').toString('base64')
    editor.commands.updateAttributes('docProtected', {
      imageDataUrl: `data:image/png;base64,${replacement}`,
      genImage: { base64: replacement, mime: 'image/png', widthPx: 96, heightPx: 64 },
    })

    const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
    expect(plan.changedCount).toBe(1)
    expect(plan.saveBlocks[0]).toMatchObject({
      kind: 'xml',
      replaceImage: { base64: replacement, mime: 'image/png' },
    })

    const saved = await saveDocx(parsed, plan.saveBlocks)
    const zip = await JSZip.loadAsync(saved)
    expect(await zip.file('word/media/image1.png')!.async('string')).toBe(
      'replacement-picture-bytes',
    )
    expect(Object.keys(zip.files).filter((name) => /word\/media\/aidocs\d+\./.test(name))).toEqual(
      [],
    )
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    expect(rels.match(/relationships\/image/g)).toHaveLength(1)
    expect(rels).toContain('Id="rId10"')
    expect(rels).not.toContain('rId11')
    editor.destroy()
  })

  it('position preset (margin align) round-trips and stays clean on reopen', async () => {
    const { editor, parsed } = await openImageDoc()
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    // Layout tab position gallery: bottom center + square wrap
    editor.commands.updateAttributes('docProtected', {
      imageWrap: 'square-left',
      imagePosH: 'center',
      imagePosV: 'bottom',
      imageOffsetXEmu: null,
      imageOffsetYEmu: null,
    })
    const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
    expect(plan.changedCount).toBe(1)
    const saved = await saveDocx(parsed, plan.saveBlocks)
    const reparsed = await parseDocx(saved)
    expect(reparsed.blocks[0].imagePosH).toBe('center')
    expect(reparsed.blocks[0].imagePosV).toBe('bottom')
    expect(reparsed.blocks[0].imageWrap).toBe('square-left')

    // reopen: same attrs come back from parse, so an untouched save stays byte-identical
    const editor2 = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: blocksToPmDoc(reparsed.blocks) as never,
    })
    const plan2 = pmDocToSavePlan(editor2.getJSON() as PmNode, reparsed.blocks)
    expect(plan2.changedCount).toBe(0)
    expect(await saveDocx(reparsed, plan2.saveBlocks)).toEqual(saved)
    editor.destroy()
    editor2.destroy()
  })

  it('setting imageWrap floats the image and round-trips through save', async () => {
    const { editor, parsed } = await openImageDoc()
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    editor.commands.updateAttributes('docProtected', { imageWrap: 'square-right' })
    expect(editor.view.dom.querySelector('.doc-protected.img-wrap-square-right')).toBeTruthy()

    const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
    expect(plan.changedCount).toBe(1)
    const saved = await saveDocx(parsed, plan.saveBlocks)
    const reparsed = await parseDocx(saved)
    expect(reparsed.blocks[0].imageWrap).toBe('square-right')

    // back to inline from the reparsed doc
    const editor2 = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: blocksToPmDoc(reparsed.blocks) as never,
    })
    editor2.view.dispatch(editor2.state.tr.setSelection(NodeSelection.create(editor2.state.doc, 0)))
    editor2.commands.updateAttributes('docProtected', { imageWrap: null })
    const plan2 = pmDocToSavePlan(editor2.getJSON() as PmNode, reparsed.blocks)
    expect(plan2.changedCount).toBe(1)
    const p3 = await parseDocx(await saveDocx(reparsed, plan2.saveBlocks))
    expect(p3.blocks[0].imageWrap).toBeUndefined()
    editor.destroy()
    editor2.destroy()
  })
})
