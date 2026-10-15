import { MissingPdfFontError } from '../src/main/pdf-font-error'
import { PDFDocument, PDFArray, PDFDict, PDFHexString, PDFName, StandardFonts } from 'pdf-lib'
import { expect, it, vi } from 'vitest'
vi.mock('../src/main/text-edit', () => ({
  inspectNativePdf: vi.fn(),
  planNativeParagraph: vi.fn(),
  applyTextEdits: vi.fn(),
  verifyTextEdits: vi.fn(),
}))
vi.mock('../src/main/native-pdf-layout', () => ({
  translationPages: () => [0],
  protectedTranslationText: (text: string) => ({ text, restore: (value: string) => value }),
  nativeParagraphs: () =>
    ['First paragraph', 'Second paragraph'].map((text, i) => ({
      paragraph: i + 1,
      text,
      rect: [20, 100 - i * 40, 200, 120 - i * 40],
      fontSize: 14,
      lineHeight: 18,
      lines: [{ y: 110 - i * 40 }],
      maxHeight: 30,
      align: 'left',
    })),
}))
import {
  inspectNativePdf,
  planNativeParagraph,
  applyTextEdits,
  verifyTextEdits,
} from '../src/main/text-edit'
import { translateNativePdf } from '../src/main/native-pdf-translation'

it('writes and verifies each paragraph before translating the next without auto shrinking', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const source = await pdf.save()
  const updated = source.slice()
  const events: string[] = []
  vi.mocked(inspectNativePdf).mockResolvedValue([
    { runs: [{ text: 'Hello world', font: 'Arial', rotated: false }] },
  ] as never)
  vi.mocked(planNativeParagraph).mockImplementation(async (bytes, input, options) => {
    expect(options.autoFit).toBe(false)
    expect(input.fontSize).toBe(14)
    expect(input.lineLeading).toBe(18)
    expect(bytes).toBe(events.length > 1 ? updated : source)
    return { edit: input, overflow: false, sourceFontRetained: true } as never
  })
  vi.mocked(applyTextEdits).mockImplementation(async () => {
    events.push('write')
    return { bytes: updated, skipped: [] }
  })
  vi.mocked(verifyTextEdits).mockImplementation(async () => {
    events.push('verify')
    return []
  })
  const progress = vi.fn()
  const result = await translateNativePdf(
    source,
    { sourceLanguage: 'en', targetLanguage: 'zh' },
    async () => {
      events.push('translate')
      return '译文'
    },
    new AbortController().signal,
    progress,
  )
  expect(
    progress.mock.calls.some(
      ([message]) => message.includes('原文：First paragraph') && message.includes('译文：译文'),
    ),
  ).toBe(true)
  expect(events).toEqual(['translate', 'write', 'verify', 'translate', 'write', 'verify'])
  expect(result.mono).toBe(updated)
  expect(result.report.translatedParagraphs).toBe(2)
  expect((await PDFDocument.load(result.dual)).getPageCount()).toBe(2)
})

it.each(['overflow', 'missing font'])(
  'keeps source text and annotations, adds memos and continues on %s',
  async (reason) => {
    vi.clearAllMocks()
    const pdf = await PDFDocument.create()
    const page = pdf.addPage()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    page.drawText('Original paragraph remains', { x: 20, y: 100, font, size: 14 })
    const existing = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [0, 0, 20, 18],
        Contents: PDFHexString.fromText('Existing note'),
      }),
    )
    page.node.set(PDFName.of('Annots'), pdf.context.obj([existing]))
    const source = await pdf.save()
    vi.mocked(inspectNativePdf).mockResolvedValue([
      { runs: [{ text: 'Hello world', font: 'Arial', rotated: false }] },
    ] as never)
    if (reason === 'missing font')
      vi.mocked(planNativeParagraph).mockRejectedValue(
        new MissingPdfFontError('Nimbus Roman 缺少中文字形'),
      )
    else vi.mocked(planNativeParagraph).mockResolvedValue({ overflow: true } as never)
    const translate = vi.fn().mockResolvedValue('完整译文：中文内容，不应丢失。')
    const result = await translateNativePdf(
      source,
      { sourceLanguage: 'en', targetLanguage: 'zh' },
      translate,
      new AbortController().signal,
    )
    expect(translate).toHaveBeenCalledTimes(2)
    expect(applyTextEdits).not.toHaveBeenCalled()
    expect(result.report.translatedParagraphs).toBe(0)
    expect(
      reason === 'missing font' ? result.report.fontMemos : result.report.overflowMemos,
    ).toEqual([
      { page: 1, paragraph: 1 },
      { page: 1, paragraph: 2 },
    ])
    const mono = await PDFDocument.load(result.mono)
    const annots = mono.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
    expect(annots.size()).toBe(3)
    const memo = annots.lookup(1, PDFDict)
    expect(memo.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toContain(
      '完整译文：中文内容，不应丢失。',
    )
    expect(memo.lookup(PDFName.of('Subj'), PDFHexString).decodeText()).toContain('Memo')
    expect(memo.lookup(PDFName.of('Rect'), PDFArray).asArray().map(String)).toEqual([
      '20',
      '102',
      '40',
      '120',
    ])
    const dual = await PDFDocument.load(result.dual)
    expect(dual.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(1)
    expect(dual.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(3)
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const readback = await getDocument({ data: result.mono.slice(), useSystemFonts: true }).promise
    try {
      const content = await (await readback.getPage(1)).getTextContent()
      expect(content.items.map((i) => ('str' in i ? i.str : '')).join('')).toBe(
        'Original paragraph remains',
      )
    } finally {
      await readback.loadingTask.destroy()
    }
    const native =
      await vi.importActual<typeof import('../src/main/text-edit')>('../src/main/text-edit')
    const later = await native.applyTextEdits(result.mono, [
      {
        pageIndex: 0,
        rect: [20, 90, 300, 120],
        oldText: 'Original paragraph remains',
        newText: 'Edited paragraph',
        fontSize: 14,
        newFont: 'noto-sc',
      },
    ])
    expect(later.skipped).toEqual([])
    const reopened = await PDFDocument.load(later.bytes)
    expect(reopened.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(3)
    expect(
      (await PDFDocument.load(source))
        .getPage(0)
        .node.lookup(PDFName.of('Annots'), PDFArray)
        .size(),
    ).toBe(1)
  },
)

it('tries another bundled Chinese font in automatic mode without discarding the translation', async () => {
  vi.resetAllMocks()
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const source = await pdf.save()
  vi.mocked(inspectNativePdf).mockResolvedValue([
    { runs: [{ text: 'Hello world', font: 'Arial', rotated: false }] },
  ] as never)
  vi.mocked(planNativeParagraph).mockImplementation(async (_bytes, input) => {
    if (input.newFont === 'noto-sc') throw new MissingPdfFontError('所选字体缺少 U+1D4DB')
    return {
      edit: input,
      overflow: false,
      sourceFontRetained: false,
      sourceFont: 'Arial',
      actualFont: 'NotoSerifSC',
    } as never
  })
  vi.mocked(applyTextEdits).mockResolvedValue({ bytes: source, skipped: [] })
  vi.mocked(verifyTextEdits).mockResolvedValue([])
  const translate = vi.fn().mockResolvedValue('完整中文译文')
  const progress = vi.fn()
  const result = await translateNativePdf(
    source,
    { sourceLanguage: 'en', targetLanguage: 'zh', font: 'auto' },
    translate,
    new AbortController().signal,
    progress,
  )
  expect(result.report.translatedParagraphs).toBe(2)
  expect(result.report.fontMemos).toHaveLength(0)
  expect(vi.mocked(planNativeParagraph).mock.calls.map(([, input]) => input.newFont)).toEqual([
    'noto-sc',
    'noto-serif-sc',
    'noto-sc',
    'noto-serif-sc',
  ])
  expect(translate).toHaveBeenCalledTimes(2)
  expect(progress.mock.calls.some(([message]) => message.includes('U+1D4DB'))).toBe(true)
})

it.each(['locate', 'write skip', 'write throw', 'verification'])(
  'retains the failed paragraph and continues after %s without committing unverified bytes',
  async (failure) => {
    vi.resetAllMocks()
    const pdf = await PDFDocument.create()
    const page = pdf.addPage()
    page.drawText('First paragraph', { x: 20, y: 100, size: 14 })
    const source = await pdf.save()
    vi.mocked(inspectNativePdf).mockResolvedValue([
      { runs: [{ text: 'Hello world', font: 'Arial', rotated: false }] },
    ] as never)
    vi.mocked(planNativeParagraph).mockImplementation(
      async (_bytes, input) =>
        ({
          edit: input,
          overflow: false,
          sourceFontRetained: false,
          sourceFont: 'Arial',
          actualFont: 'NotoSansSC',
        }) as never,
    )
    vi.mocked(applyTextEdits).mockImplementation(async (bytes) => ({ bytes, skipped: [] }))
    vi.mocked(verifyTextEdits).mockResolvedValue([])
    if (failure === 'locate')
      vi.mocked(planNativeParagraph).mockRejectedValueOnce(
        new Error('the edited text could not be located on the page'),
      )
    if (failure === 'write skip')
      vi.mocked(applyTextEdits).mockResolvedValueOnce({
        bytes: new Uint8Array([1]),
        skipped: [{ pageIndex: 0, oldText: 'First paragraph', reason: 'text object missing' }],
      })
    if (failure === 'write throw')
      vi.mocked(applyTextEdits).mockRejectedValueOnce(new Error('cannot regenerate page'))
    if (failure === 'verification') {
      vi.mocked(applyTextEdits).mockResolvedValueOnce({ bytes: new Uint8Array([1]), skipped: [] })
      vi.mocked(verifyTextEdits).mockResolvedValueOnce([
        { pageIndex: 0, reason: 'replacement text missing' },
      ])
    }
    const translate = vi.fn().mockResolvedValue('保留的完整译文')
    const result = await translateNativePdf(
      source,
      { sourceLanguage: 'en', targetLanguage: 'zh' },
      translate,
      new AbortController().signal,
    )
    expect(translate).toHaveBeenCalledTimes(2)
    expect(result.report.translatedParagraphs).toBe(1)
    expect(result.report.fontChanges).toHaveLength(1)
    expect(result.report.skippedParagraphs).toEqual([
      expect.objectContaining({ page: 1, paragraph: 1, translation: '保留的完整译文' }),
    ])
    const reopened = await PDFDocument.load(result.mono)
    const notes = reopened.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
    expect(notes.size()).toBe(1)
    expect(
      notes.lookup(0, PDFDict).lookup(PDFName.of('Contents'), PDFHexString).decodeText(),
    ).toContain('保留的完整译文')
    expect(
      (await PDFDocument.load(source))
        .getPage(0)
        .node.lookupMaybe(PDFName.of('Annots'), PDFArray)
        ?.size() ?? 0,
    ).toBe(0)
  },
)

it('does not turn cancellation into a skipped paragraph', async () => {
  vi.resetAllMocks()
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const source = await pdf.save()
  vi.mocked(inspectNativePdf).mockResolvedValue([
    { runs: [{ text: 'Hello world', font: 'Arial', rotated: false }] },
  ] as never)
  const controller = new AbortController()
  vi.mocked(planNativeParagraph).mockImplementation(async () => {
    controller.abort()
    throw new Error('cancelled layout')
  })
  const translate = vi.fn().mockResolvedValue('译文')
  await expect(
    translateNativePdf(
      source,
      { sourceLanguage: 'en', targetLanguage: 'zh' },
      translate,
      controller.signal,
    ),
  ).rejects.toThrow()
  expect(translate).toHaveBeenCalledOnce()
  expect(applyTextEdits).not.toHaveBeenCalled()
})
