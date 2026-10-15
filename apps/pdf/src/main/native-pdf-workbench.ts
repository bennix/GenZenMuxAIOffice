import { randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { workbenchPath } from './workbench-path'
import { PDFDocument, degrees } from 'pdf-lib'
import { EDIT_FONTS, type SavePdfRequest, type TextEditInput } from '../shared/ipc'
import type { PdfEngineResult, PdfEngineTool } from '../shared/pdf-engines'
import {
  applyTextEdits,
  inspectNativePdf,
  listEditFonts,
  planNativeParagraph,
  registerDocumentFont,
  unregisterDocumentFont,
  verifyTextEdits,
} from './text-edit'
import { nativeParagraphs } from './native-pdf-layout'
import { applySaveRequest, encryptPdfBytes, extractPagesBytes, insertPdfBytes } from './save-pdf'
import { fontCoversText } from './font-cmap'
import { findNimbusRomanFont } from './font-bundle'
import { findSystemFont } from './font-locate'

const num = (type = 'number', description?: string) => ({
  type,
  ...(description ? { description } : {}),
})
const props = { doc: num('integer'), page: num('integer') }
const tool = (
  name: string,
  title: string,
  properties: Record<string, object>,
  required: string[],
  readOnly = false,
  description = title,
): PdfEngineTool => ({
  name,
  title,
  description,
  inputSchema: { properties, required },
  annotations: { readOnlyHint: readOnly },
})
const TOOLS: PdfEngineTool[] = [
  tool('doc_open', '打开 PDF', { path: num('string') }, ['path']),
  tool('doc_list', '打开的文档', {}, [], true),
  tool('doc_info', '文档属性与字体', { doc: props.doc }, ['doc'], true),
  tool('doc_close', '关闭文档', { doc: props.doc }, ['doc']),
  tool('doc_save', '原子保存 PDF', { doc: props.doc, path: num('string') }, ['doc', 'path']),
  tool(
    'doc_set_info',
    '修改文档属性',
    {
      doc: props.doc,
      key: { type: 'string', enum: ['Title', 'Author', 'Subject', 'Keywords'] },
      value: num('string'),
    },
    ['doc', 'key', 'value'],
  ),
  tool('page_render', '实际 PDF 页面预览', { ...props, dpi: num() }, ['doc', 'page'], true),
  tool('text_paragraphs', '识别段落', props, ['doc', 'page'], true),
  tool('text_lines', '读取文字对象', props, ['doc', 'page'], true),
  tool('text_fonts', '查看字体', props, ['doc', 'page'], true),
  tool('text_font_import', '载入完整字体', { ...props, path: num('string') }, [
    'doc',
    'page',
    'path',
  ]),
  tool(
    'text_font_advice',
    '同族字体检查与下载建议',
    { ...props, font: num('string'), text: num('string') },
    ['doc', 'page', 'font'],
    true,
  ),
  tool(
    'text_edit_layout',
    '字体与段落溢出检查',
    {
      ...props,
      paragraph: num('integer'),
      text: num('string'),
      size: num(),
      width: num(),
      font_resource: num('string'),
      line_spacing: num(),
      char_spacing: num(),
      scale: num(),
      dx: num(),
      dy: num(),
    },
    ['doc', 'page', 'paragraph'],
    true,
  ),
  tool(
    'text_edit',
    '保真编辑与段落精排',
    {
      ...props,
      paragraph: num('integer'),
      text: num('string'),
      size: num(),
      width: num(),
      font_resource: num('string'),
      line_spacing: num(),
      char_spacing: num(),
      scale: num(),
      dx: num(),
      dy: num(),
      bold: { type: 'boolean' },
      italic: { type: 'boolean' },
      underline: { type: 'boolean' },
      align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
      color: num('string'),
    },
    ['doc', 'page', 'paragraph'],
  ),
  tool('text_extract', '提取全文', { doc: props.doc }, ['doc'], true),
  tool('text_find', '查找文字', { doc: props.doc, query: num('string') }, ['doc', 'query'], true),
  tool('edit_undo', '撤销', { doc: props.doc }, ['doc']),
  tool('edit_redo', '重做', { doc: props.doc }, ['doc']),
  tool('page_rotate', '旋转页面', { doc: props.doc, pages: { type: 'array' }, degrees: num() }, [
    'doc',
    'pages',
    'degrees',
  ]),
  tool('page_delete', '删除页面', { doc: props.doc, pages: { type: 'array' } }, ['doc', 'pages']),
  tool('page_move', '调整页序', { doc: props.doc, order: { type: 'array' } }, ['doc', 'order']),
  tool('page_insert_blank', '插入空白页', { ...props, width: num(), height: num() }, [
    'doc',
    'page',
  ]),
  tool('page_insert_file', '插入 PDF', { ...props, path: num('string') }, ['doc', 'page', 'path']),
  tool(
    'page_extract',
    '抽取页面',
    { doc: props.doc, pages: { type: 'array' }, path: num('string') },
    ['doc', 'pages', 'path'],
  ),
  tool('doc_combine', '合并 PDF', { paths: { type: 'array' }, path: num('string') }, [
    'paths',
    'path',
  ]),
  tool('doc_split', '拆分 PDF', { doc: props.doc, every: num('integer'), out_dir: num('string') }, [
    'doc',
    'every',
    'out_dir',
  ]),
  tool(
    'doc_export_text',
    '导出文本',
    { doc: props.doc, path: num('string', 'Output .txt path') },
    ['doc', 'path'],
    true,
  ),
  tool(
    'doc_export_images',
    '导出页面图片',
    { doc: props.doc, out_dir: num('string'), dpi: num() },
    ['doc', 'out_dir'],
    true,
  ),
  tool('image_list', '查看文档图片', { doc: props.doc }, ['doc'], true),
  tool('image_edit', '移动、缩放、替换或删除图片', { doc: props.doc, edits: { type: 'array' } }, [
    'doc',
    'edits',
  ]),
  tool(
    'document_edit',
    '注释、表单、水印与页面操作',
    { doc: props.doc, request: { type: 'object' } },
    ['doc', 'request'],
  ),
  tool(
    'doc_protect',
    '加密 PDF 副本',
    { doc: props.doc, password: num('string'), path: num('string') },
    ['doc', 'password', 'path'],
  ),
]
interface NativeDocument {
  id: number
  name: string
  bytes: Uint8Array
  undo: Uint8Array[]
  redo: Uint8Array[]
  savedHash: string
}
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const result = (value: unknown): PdfEngineResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
})
export class NativePdfWorkbench {
  private docs = new Map<number, NativeDocument>()
  private fonts = new Map<string, { font: string }>()
  private next = 0
  private serial: Promise<unknown> = Promise.resolve()
  constructor(readonly root: string) {}
  async initialize(): Promise<PdfEngineTool[]> {
    return TOOLS
  }
  close(): void {
    for (const id of this.fonts.keys()) unregisterDocumentFont(id)
    this.fonts.clear()
    this.docs.clear()
  }
  call(name: string, args: Record<string, unknown>): Promise<PdfEngineResult> {
    const run = this.serial.then(() => this.execute(name, args))
    this.serial = run.catch(() => {})
    return run
  }
  private async path(value: unknown): Promise<string> {
    return workbenchPath(this.root, value)
  }

  private get(args: Record<string, unknown>): NativeDocument {
    const doc = this.docs.get(Number(args.doc))
    if (!doc) throw new Error('Document is not open')
    return doc
  }
  private summary(d: NativeDocument) {
    return {
      doc: d.id,
      name: d.name,
      dirty: hash(d.bytes) !== d.savedHash,
      undo: d.undo.length > 0,
      redo: d.redo.length > 0,
    }
  }
  private mutate(d: NativeDocument, bytes: Uint8Array): void {
    d.undo.push(d.bytes)
    d.redo = []
    let memory = d.undo.reduce((n, b) => n + b.length, 0)
    while (memory > 128 * 1024 * 1024 && d.undo.length > 1) memory -= d.undo.shift()!.length
    d.bytes = bytes
  }
  private async save(path: string, bytes: Uint8Array): Promise<void> {
    await PDFDocument.load(bytes)
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, bytes, { flag: 'wx' })
      if (hash(await readFile(temp)) !== hash(bytes))
        throw new Error('Saved PDF differs from verified bytes')
      await rename(temp, path)
    } finally {
      await rm(temp, { force: true })
    }
  }
  private async execute(name: string, a: Record<string, unknown>): Promise<PdfEngineResult> {
    const definition = TOOLS.find((t) => t.name === name)
    if (!definition) throw new Error(`Unsupported tool: ${name}`)
    for (const key of definition.inputSchema.required ?? [])
      if (a[key] === undefined) throw new Error(`Missing ${key}`)
    if (name === 'doc_open') {
      const path = await this.path(a.path),
        bytes = new Uint8Array(await readFile(path))
      const pdf = await PDFDocument.load(bytes)
      const d: NativeDocument = {
        id: ++this.next,
        name: path.split(/[\\/]/).pop()!,
        bytes,
        undo: [],
        redo: [],
        savedHash: hash(bytes),
      }
      this.docs.set(d.id, d)
      return result({ ...this.summary(d), pages: pdf.getPageCount(), editable: true })
    }
    if (name === 'doc_list') return result([...this.docs.values()].map((d) => this.summary(d)))
    if (name === 'doc_combine') {
      if (!Array.isArray(a.paths) || !a.paths.length) throw new Error('Choose PDF files to combine')
      let bytes: Uint8Array = new Uint8Array(await readFile(await this.path(a.paths[0])))
      for (const path of a.paths.slice(1)) {
        const current = await PDFDocument.load(bytes)
        bytes = (
          await insertPdfBytes(
            bytes,
            new Uint8Array(await readFile(await this.path(path))),
            current.getPageCount() - 1,
          )
        ).merged
      }
      const path = await this.path(a.path)
      await this.save(path, bytes)
      return this.execute('doc_open', { path })
    }
    const d = this.get(a),
      pdf = await PDFDocument.load(d.bytes)
    if (name === 'doc_info')
      return result({
        document: { ...this.summary(d), pages: pdf.getPageCount() },
        title: pdf.getTitle(),
        author: pdf.getAuthor(),
        fonts: [
          ...new Set((await inspectNativePdf(d.bytes)).flatMap((p) => p.runs.map((r) => r.font))),
        ],
      })
    if (name === 'doc_close') {
      this.docs.delete(d.id)
      return result({ closed: true })
    }
    if (name === 'doc_save') {
      const path = await this.path(a.path)
      await this.save(path, d.bytes)
      d.savedHash = hash(d.bytes)
      return result({ ...this.summary(d), path })
    }
    if (name === 'edit_undo' || name === 'edit_redo') {
      const from = name === 'edit_undo' ? d.undo : d.redo,
        to = name === 'edit_undo' ? d.redo : d.undo
      const next = from.pop()
      if (!next) throw new Error('No history step available')
      to.push(d.bytes)
      d.bytes = next
      return result(this.summary(d))
    }
    if (name === 'doc_set_info') {
      const value = String(a.value ?? '')
      switch (a.key) {
        case 'Title':
          pdf.setTitle(value)
          break
        case 'Author':
          pdf.setAuthor(value)
          break
        case 'Subject':
          pdf.setSubject(value)
          break
        case 'Keywords':
          pdf.setKeywords(value.split(','))
          break
        default:
          throw new Error('Unknown metadata field')
      }
      this.mutate(d, await pdf.save())
      return result(this.summary(d))
    }
    if (name === 'text_extract' || name === 'text_find' || name === 'doc_export_text') {
      const pages = (await inspectNativePdf(d.bytes)).map((p) =>
        p.runs.map((r) => r.text).join('\n'),
      )
      if (name === 'text_find')
        return result({
          matches: pages.flatMap((text, i) =>
            text.includes(String(a.query)) ? [{ page: i + 1, text }] : [],
          ),
        })
      const text = pages.join('\f')
      if (name === 'doc_export_text') await writeFile(await this.path(a.path), text)
      return result({ text })
    }
    if (name === 'image_list') {
      const { listPageImages } = await import('./image-edit')
      return result({ images: await listPageImages(d.bytes) })
    }
    if (name === 'image_edit' || name === 'document_edit') {
      const request: SavePdfRequest = {
        path: '',
        markups: [],
        drawings: [],
        formValues: [],
        stamps: [],
        ...(name === 'image_edit'
          ? { imageEdits: a.edits as SavePdfRequest['imageEdits'] }
          : (a.request as object)),
      }
      const changed = await applySaveRequest(d.bytes, request)
      if (changed.skippedImageEdits.length || changed.skippedTextEdits.length)
        throw new Error('Some document edits could not be applied; all changes were rolled back')
      this.mutate(d, changed.bytes)
      return result(this.summary(d))
    }
    if (name === 'doc_protect') {
      await this.save(await this.path(a.path), await encryptPdfBytes(d.bytes, String(a.password)))
      return result({ path: a.path })
    }
    if (name === 'page_extract') {
      const pages = this.pageList(a.pages, pdf.getPageCount())
      await this.save(await this.path(a.path), await extractPagesBytes(d.bytes, pages))
      return result({ path: a.path })
    }
    if (name === 'doc_split') {
      const every = Number(a.every)
      if (!Number.isInteger(every) || every < 1) throw new Error('every must be positive')
      const dir = await this.path(a.out_dir)
      await mkdir(dir, { recursive: true })
      const paths = []
      for (let i = 0; i < pdf.getPageCount(); i += every) {
        const path = join(dir, `part-${i + 1}.pdf`)
        await this.save(
          path,
          await extractPagesBytes(
            d.bytes,
            Array.from({ length: Math.min(every, pdf.getPageCount() - i) }, (_, k) => i + k),
          ),
        )
        paths.push(path)
      }
      return result({ paths })
    }
    if (name === 'doc_export_images') {
      const dir = await this.path(a.out_dir)
      await mkdir(dir, { recursive: true })
      const paths = []
      for (let page = 1; page <= pdf.getPageCount(); page++) {
        const image = await this.execute('page_render', { doc: d.id, page, dpi: a.dpi })
        const path = join(dir, `page-${page}.png`)
        await writeFile(path, Buffer.from(image.content[0]!.data!, 'base64'))
        paths.push(path)
      }
      return result({ paths })
    }
    if (name === 'page_rotate' || name === 'page_delete' || name === 'page_move') {
      const pages = this.pageList(name === 'page_move' ? a.order : a.pages, pdf.getPageCount())
      if (name === 'page_rotate')
        for (const p of pages)
          pdf
            .getPage(p)
            .setRotation(degrees((pdf.getPage(p).getRotation().angle + Number(a.degrees)) % 360))
      else if (name === 'page_delete') {
        if (pages.length === pdf.getPageCount()) throw new Error('Cannot delete every page')
        for (const p of pages.sort((x, y) => y - x)) pdf.removePage(p)
      } else {
        if (pages.length !== pdf.getPageCount())
          throw new Error('Page order must include every page')
        const changed = await applySaveRequest(d.bytes, {
          path: '',
          markups: [],
          drawings: [],
          formValues: [],
          stamps: [],
          pageOrder: pages,
        })
        this.mutate(d, changed.bytes)
        return result(this.summary(d))
      }
      this.mutate(d, await pdf.save())
      return result(this.summary(d))
    }
    const pi = Number(a.page) - 1
    if (
      !Number.isInteger(pi) ||
      pi < 0 ||
      pi >= pdf.getPageCount() + (name === 'page_insert_blank' ? 1 : 0)
    )
      throw new Error('Page number is out of range')
    if (name === 'page_insert_blank') {
      pdf.insertPage(pi, [Number(a.width) || 595, Number(a.height) || 842])
      this.mutate(d, await pdf.save())
      return result(this.summary(d))
    }
    if (name === 'page_insert_file') {
      this.mutate(
        d,
        (await insertPdfBytes(d.bytes, new Uint8Array(await readFile(await this.path(a.path))), pi))
          .merged,
      )
      return result(this.summary(d))
    }
    const page = (await inspectNativePdf(d.bytes))[pi]!
    if (name === 'page_render') {
      const { renderPagePreviewPng } = await import('./image-edit')
      const image = await renderPagePreviewPng(d.bytes, {
        pageIndex: pi,
        excludeRects: [],
        clip: { x: 0, y: 0, width: page.width, height: page.height },
        pxWidth: Math.ceil((page.width * Math.max(24, Math.min(200, Number(a.dpi) || 96))) / 72),
        rotate: 0,
      })
      if (!image) throw new Error('Page rendering failed')
      return { content: [{ type: 'image', mimeType: 'image/png', data: image }] }
    }
    if (name === 'text_lines') return result({ lines: page.runs })
    if (name === 'text_fonts')
      return result({
        fonts: [...new Set(page.runs.map((r) => r.font))]
          .map((font) => ({ font, resource: `original:${font}`, preview_only: true }))
          .concat(
            listEditFonts().map((id) => ({
              font: EDIT_FONTS.find((f) => f.id === id)?.label ?? id,
              resource: id,
              preview_only: false,
            })),
          )
          .concat(
            [...this.fonts].map(([resource, v]) => ({
              font: v.font,
              resource,
              preview_only: false,
            })),
          ),
      })
    if (name === 'text_font_import') {
      const path = await this.path(a.path),
        bytes = await readFile(path)
      this.checkEmbedding(bytes)
      const resource = `native-font-${randomUUID()}`
      registerDocumentFont(resource, bytes)
      const font = path.split(/[\\/]/).pop()!
      this.fonts.set(resource, { font })
      return result({ resource, font })
    }
    if (name === 'text_font_advice') {
      const font = String(a.font),
        local = findSystemFont(font, font) ?? findNimbusRomanFont(font)
      return result({
        font,
        localFamilyAvailable: !!local,
        localCoversText: !!local && fontCoversText(local, String(a.text ?? '')),
        downloads: fontDownloads(font),
        note: 'Install the original family, then reopen the paragraph. Choosing another family requires an explicit font selection.',
      })
    }
    const paragraphs = nativeParagraphs(page)
    if (name === 'text_paragraphs')
      return result({
        page: pi + 1,
        count: paragraphs.length,
        paragraphs: paragraphs.map((p) => ({
          ...p,
          editor_text: p.text,
          size: p.fontSize,
          rect: [p.rect[0], page.height - p.rect[3], p.rect[2], page.height - p.rect[1]],
        })),
      })
    const p = paragraphs[Number(a.paragraph) - 1]
    if (!p) throw new Error('Paragraph is out of range')
    const newText = String(a.text ?? p.text)
    const edit: TextEditInput = {
      pageIndex: pi,
      rect: p.rect,
      oldText: p.text,
      newText,
      fontSize: p.fontSize,
      origin: [p.rect[0] + Number(a.dx || 0), p.lines[0]!.y + Number(a.dy || 0)],
      ...(a.font_resource ? { newFont: String(a.font_resource) } : {}),
      ...(a.size ? { newFontSize: Number(a.size) } : {}),
      ...(a.line_spacing
        ? { lineLeading: Number(a.line_spacing) * (Number(a.size) || p.fontSize) }
        : { lineLeading: p.lineHeight }),
      ...(a.bold === undefined ? {} : { newBold: !!a.bold }),
      ...(a.italic === undefined ? {} : { newItalic: !!a.italic }),
      ...(a.char_spacing === undefined ? {} : { characterSpacing: Number(a.char_spacing) }),
      ...(a.scale === undefined ? {} : { horizontalScale: Number(a.scale) }),
    }
    if (a.color) {
      const color = /^#([\da-f]{6})$/i.exec(String(a.color))
      if (!color) throw new Error('Invalid text colour')
      edit.newColor = [0, 2, 4].map((i) => parseInt(color[1]!.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ]
    }
    const plan = await planNativeParagraph(d.bytes, edit, {
      width: Number(a.width) || p.rect[2] - p.rect[0],
      maxHeight: p.maxHeight,
      align: (a.align as 'left' | 'center' | 'right') ?? p.align,
      preserveFont: true,
    })
    if (name === 'text_edit_layout')
      return result({
        page: pi + 1,
        paragraph: p.paragraph,
        source_rect: p.rect,
        draft_rect: plan.rect,
        overflow: plan.overflow,
        source_font: plan.sourceFont,
        actual_font: plan.actualFont,
        source_font_retained: plan.sourceFontRetained,
      })
    if (plan.overflow)
      throw new Error(
        '段落会遮挡相邻内容，未应用。请增大段落宽度或缩小字号 / Paragraph overflows; no changes applied',
      )
    const applied = await applyTextEdits(d.bytes, [plan.edit])
    if (applied.skipped.length) throw new Error('Paragraph replacement failed; no changes applied')
    let bytes = applied.bytes
    if (a.underline) {
      const changed = await PDFDocument.load(bytes)
      const pg = changed.getPage(pi)
      for (const [i, width] of plan.lineWidths.entries())
        pg.drawLine({
          start: {
            x: plan.edit.origin![0] + (plan.edit.lineXOffsets?.[i] ?? 0),
            y: plan.edit.origin![1] - i * plan.edit.lineLeading! - p.fontSize * 0.15,
          },
          end: {
            x: plan.edit.origin![0] + (plan.edit.lineXOffsets?.[i] ?? 0) + width,
            y: plan.edit.origin![1] - i * plan.edit.lineLeading! - p.fontSize * 0.15,
          },
          thickness: Math.max(0.5, p.fontSize * 0.04),
        })
      bytes = await changed.save()
    }
    if ((await verifyTextEdits(bytes, [plan.edit])).length)
      throw new Error('Paragraph read-back verification failed; no changes applied')
    this.mutate(d, bytes)
    return result({
      ...this.summary(d),
      paragraph: { text: newText, font: plan.actualFont },
      source_font_retained: plan.sourceFontRetained,
    })
  }
  private pageList(value: unknown, count: number): number[] {
    if (!Array.isArray(value) || !value.length) throw new Error('Choose page numbers')
    const pages = value.map((v) => Number(v) - 1)
    if (
      pages.some((p) => !Number.isInteger(p) || p < 0 || p >= count) ||
      new Set(pages).size !== pages.length
    )
      throw new Error('Invalid or duplicate page number')
    return pages
  }
  private checkEmbedding(bytes: Buffer): void {
    // OS/2 fsType bit 1 forbids embedding. Respect the actual face, not a brand blacklist.
    if (bytes.length < 12) throw new Error('Invalid font')
    const count = bytes.readUInt16BE(4)
    for (let i = 0; i < count; i++) {
      const p = 12 + i * 16
      if (p + 16 > bytes.length) throw new Error('Invalid font table')
      if (bytes.toString('ascii', p, p + 4) === 'OS/2') {
        const at = bytes.readUInt32BE(p + 8)
        if (at + 10 > bytes.length) throw new Error('Invalid font permissions')
        if (bytes.readUInt16BE(at + 8) & 2)
          throw new Error('This font does not permit embedding; obtain an embeddable face')
      }
    }
  }
}
export function fontDownloads(font: string): { label: string; url: string }[] {
  if (/noto|sourcehan|思源/i.test(font))
    return [{ label: 'Noto 官方字体', url: 'https://fonts.google.com/noto' }]
  if (/arial|times|calibri|cambria|simsun|宋体|微软雅黑/i.test(font))
    return [
      {
        label: 'Microsoft 官方字体信息（需合法授权）',
        url: 'https://learn.microsoft.com/typography/font-list/',
      },
    ]
  return [{ label: `查找 ${font} 的官方字库或合法安装来源`, url: 'https://fonts.google.com/' }]
}
