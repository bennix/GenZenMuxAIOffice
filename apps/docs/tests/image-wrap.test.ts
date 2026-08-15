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
import { imageWrapAttributes } from '../src/renderer/editor/image-wrap'

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
  it('uses the declared picture extent as its responsive aspect ratio', async () => {
    const { editor } = await openImageDoc()
    const image = editor.view.dom.querySelector<HTMLImageElement>('.doc-protected-img')
    const wrap = editor.view.dom.querySelector<HTMLElement>('.doc-img-wrap')
    expect(image).toBeTruthy()
    expect(wrap?.classList.contains('doc-img-sized')).toBe(true)
    expect(image!.style.width).toBe('96px')
    expect(image!.style.height).toBe('auto')
    expect(image!.style.aspectRatio).toBe('96/96')
    expect(image!.style.objectFit).toBe('fill')
    editor.destroy()
  })

  it('resizes horizontally from the corner handle and preserves the aspect ratio', async () => {
    const { editor } = await openImageDoc()
    const handle = editor.view.dom.querySelector<HTMLElement>('.img-resize-handle')!

    handle.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
    )
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 100 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 180, clientY: 100 }))

    const resized = editor.state.doc.nodeAt(0)!
    expect(resized.attrs.imageWidthPx).toBe(176)
    expect(resized.attrs.imageHeightPx).toBe(176)
    expect(editor.view.dom.querySelector<HTMLImageElement>('.doc-protected-img')!.style.width).toBe(
      '176px',
    )
    editor.destroy()
  })

  it('does not rewrite picture dimensions when the resize handle is only clicked', async () => {
    const { editor } = await openImageDoc()
    const handle = editor.view.dom.querySelector<HTMLElement>('.img-resize-handle')!

    handle.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
    )
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 100 }))

    expect(editor.state.doc.nodeAt(0)!.attrs.imageWidthPx).toBe(96)
    expect(editor.state.doc.nodeAt(0)!.attrs.imageHeightPx).toBe(96)
    editor.destroy()
  })

  it.each(['front', 'behind'] as const)(
    'keeps a %s-text picture visible and sized',
    async (wrap) => {
      const { editor } = await openImageDoc()
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
      editor.commands.updateAttributes('docProtected', { imageWrap: wrap })

      const node = editor.view.dom.querySelector<HTMLElement>(`.img-wrap-${wrap}`)
      const image = node?.querySelector<HTMLImageElement>('.doc-protected-img')
      const imageWrap = node?.querySelector<HTMLElement>('.doc-img-wrap')
      expect(node).toBeTruthy()
      expect(node?.classList.contains('doc-protected-floating')).toBe(true)
      expect(imageWrap?.classList.contains('doc-img-sized')).toBe(true)
      expect(image?.style.width).toBe('96px')
      expect(image?.src).toMatch(/^data:image\//)
      editor.destroy()
    },
  )

  it('keeps the side-wrap box at the declared picture width', async () => {
    const { editor } = await openImageDoc()
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    editor.commands.updateAttributes('docProtected', {
      imageWrap: 'square-right',
      imageWidthPx: 559,
      imageHeightPx: 453,
    })

    const node = editor.view.dom.querySelector<HTMLElement>('.img-wrap-square-right')
    const image = node?.querySelector<HTMLImageElement>('.doc-protected-img')
    expect(node?.style.width).toBe('559px')
    expect(node?.style.maxWidth).toBe('none')
    expect(image?.style.width).toBe('559px')
    editor.destroy()
  })

  it('drops stale free-position offsets when moving a side-wrapped picture in front of text', async () => {
    const { editor, parsed } = await openImageDoc()
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    editor.commands.updateAttributes('docProtected', {
      imageWrap: 'square-right',
      imageOffsetXEmu: 11_791_950,
      imageOffsetYEmu: 3_933_825,
      imagePosH: null,
      imagePosV: null,
    })

    const patch = imageWrapAttributes(editor.getAttributes('docProtected'), 'front')
    expect(patch).toMatchObject({
      imageWrap: 'front',
      imagePosH: 'right',
      imagePosV: 'top',
      imageOffsetXEmu: null,
      imageOffsetYEmu: null,
    })
    editor.commands.updateAttributes('docProtected', patch)

    const node = editor.view.dom.querySelector<HTMLElement>('.img-wrap-front')
    const imageWrap = node?.querySelector<HTMLElement>('.doc-img-wrap')
    expect(node?.classList.contains('doc-protected-floating')).toBe(true)
    expect(imageWrap?.style.right).toBe('0px')
    expect(imageWrap?.style.transform).toBe('translate(0.0px,0.0px)')
    expect(imageWrap?.querySelector('.doc-protected-img')).toBeTruthy()

    const saved = await saveDocx(
      parsed,
      pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks).saveBlocks,
    )
    const reparsed = await parseDocx(saved)
    expect(reparsed.blocks[0]).toMatchObject({
      imageWrap: 'front',
      imagePosH: 'right',
      imagePosV: 'top',
    })
    expect(reparsed.blocks[0].imageOffsetXEmu).toBeUndefined()
    expect(reparsed.blocks[0].imageOffsetYEmu).toBeUndefined()
    editor.destroy()
  })

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
