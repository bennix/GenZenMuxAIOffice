import { translationFont, translationParagraph } from '../shared/translation-font'
import { MissingPdfFontError } from './pdf-font-error'
import { PDFDocument, PDFArray, PDFHexString, PDFName } from 'pdf-lib'
import type { PdfTranslationOptions } from '../shared/pdf-engines'
import type { TextEditInput } from '../shared/ipc'
import { nativeParagraphs, protectedTranslationText, translationPages } from './native-pdf-layout'
import { applyTextEdits, inspectNativePdf, planNativeParagraph, verifyTextEdits } from './text-edit'

export interface NativeTranslationReport {
  translatedParagraphs: number
  overflowMemos: { page: number; paragraph: number }[]
  fontMemos: { page: number; paragraph: number }[]
  skippedParagraphs: { page: number; paragraph: number; reason: string; translation: string }[]
  protectedRuns: number
  selectedPages: number[]
  fontChanges: { page: number; paragraph: number; source: string; actual: string }[]
}
export async function translateNativePdf(
  source: Uint8Array,
  options: PdfTranslationOptions,
  translate: (system: string, user: string) => Promise<string>,
  signal: AbortSignal,
  progress: (message: string) => void = () => {},
): Promise<{ mono: Uint8Array; dual: Uint8Array; report: NativeTranslationReport }> {
  const pages = await inspectNativePdf(source)
  const selected = translationPages(options.pages, pages.length)
  const fontPattern = options.formulaFont
    ? new RegExp(options.formulaFont, 'i')
    : /math|symbol|cmsy|cmmi|cmex|msam|msbm|stix.*math/i
  const protectedRun = (r: { text: string; font: string; rotated: boolean }) =>
    r.rotated ||
    fontPattern.test(r.font) ||
    (/^cmr\d+$/i.test(r.font) && r.text.length <= 40 && /[\d=():]|[^\p{ASCII}]/u.test(r.text)) ||
    (!/[\p{L}\p{Script=Han}]{2}/u.test(r.text) && /[=∫∑√≤≥^]/.test(r.text))
  const report: NativeTranslationReport = {
    translatedParagraphs: 0,
    overflowMemos: [],
    fontMemos: [],
    skippedParagraphs: [],
    protectedRuns: 0,
    selectedPages: selected.map((p) => p + 1),
    fontChanges: [],
  }
  const jobs = selected.flatMap((pi) => {
    const preserved = pages[pi]!.runs.filter(protectedRun)
    report.protectedRuns += preserved.length
    if (preserved.length)
      progress(
        `第 ${pi + 1} 页公式/特殊文字原对象保留（不重绘）：\n${preserved.map((r) => r.text).join(' ')}\n`,
      )
    if (!pages[pi]!.runs.length)
      throw new Error(
        `第 ${pi + 1} 页没有可编辑文字；扫描件请先完成文字识别 / No editable text on page ${pi + 1}`,
      )
    return nativeParagraphs(pages[pi]!, protectedRun)
      .filter((p) => /[\p{L}\p{Script=Han}]{2}/u.test(p.text))
      .map((p) => ({ pi, p }))
  })
  if (!jobs.length) throw new Error('No translatable text was found')
  const cache = new Map<string, string>()
  const edits: TextEditInput[] = []
  let translatedBytes = source
  const retainWithMemo = async (
    p: (typeof jobs)[number]['p'],
    pi: number,
    translation: string,
    reason: string,
    title: string,
  ) => {
    signal.throwIfAborted()
    const pdf = await PDFDocument.load(translatedBytes)
    const page = pdf.getPage(pi)
    const x = Math.max(0, Math.min(p.rect[0], page.getWidth() - 20))
    const y = Math.max(18, Math.min(p.rect[3], page.getHeight()))
    const memo = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Name: 'Comment',
      Rect: [x, y - 18, x + 20, y],
      C: [1, 0.8, 0],
      F: 4,
      P: page.ref,
      T: PDFHexString.fromText('ZenOffice'),
      Subj: PDFHexString.fromText(title),
      Contents: PDFHexString.fromText(
        `Memo：${reason}，已保留原文，未压缩文字。\n\n完整译文：\n${translation}`,
      ),
    })
    const ref = pdf.context.register(memo)
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (annots) annots.push(ref)
    else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]))
    translatedBytes = await pdf.save()
  }
  for (const [index, { pi, p }] of jobs.entries()) {
    signal.throwIfAborted()
    progress(`正在翻译第 ${index + 1}/${jobs.length} 段 · 第 ${pi + 1} 页`)
    const protectedText = protectedTranslationText(
      translationParagraph(p.text),
      options.formulaCharacters,
    )
    let value = options.ignoreCache ? undefined : cache.get(protectedText.text)
    if (value === undefined) {
      value = (
        await translate(
          `Translate from ${options.sourceLanguage} into ${options.targetLanguage}. Return only the translated paragraph. Preserve every ⟦ZENKEEPn⟧ token exactly once, and keep facts, names and numbers. Source line breaks were layout wraps: translate this as a single paragraph. Do not explain or use Markdown fences.`,
          protectedText.text,
        )
      ).trim()
      cache.set(protectedText.text, value)
    }
    signal.throwIfAborted()
    let translation = value
    let stage = '译文校验'
    try {
      if (!value) throw new Error('AI 返回空译文')
      translation = protectedText.restore(value)
      progress(
        `第 ${pi + 1} 页第 ${p.paragraph} 段\n原文：${translationParagraph(p.text)}\n译文：${translation}\n`,
      )
      stage = '布局预检'
      let missingFont = ''
      let selectedFont = translationFont(options.font, options.targetLanguage, p.font)
      const planWithFont = () =>
        planNativeParagraph(
          translatedBytes,
          {
            pageIndex: pi,
            rect: p.rect,
            oldText: p.text,
            newText: translation,
            fontSize: p.fontSize,
            origin: [p.rect[0], p.lines[0]!.y],
            lineLeading: p.lineHeight,
            embedFullFont: options.skipSubsetFonts,
            newFont: selectedFont,
          },
          {
            width: p.rect[2] - p.rect[0],
            maxHeight: p.maxHeight,
            autoFit: false,
            align: p.align,
            preserveFont: !selectedFont,
          },
        )
      let plan: Awaited<ReturnType<typeof planNativeParagraph>> | null = null
      const candidates =
        options.font === 'auto' &&
        selectedFont &&
        ['noto-sc', 'noto-serif-sc'].includes(selectedFont)
          ? [selectedFont, selectedFont === 'noto-sc' ? 'noto-serif-sc' : 'noto-sc']
          : [selectedFont]
      for (const candidate of candidates) {
        signal.throwIfAborted()
        selectedFont = candidate
        try {
          plan = await planWithFont()
          missingFont = ''
          if (candidate !== candidates[0])
            progress(
              `第 ${pi + 1} 页第 ${p.paragraph} 段已使用另一内置字库 ${candidate}，完整覆盖译文字形。`,
            )
          break
        } catch (error) {
          if (!(error instanceof MissingPdfFontError))
            throw new Error(
              `第 ${pi + 1} 页第 ${p.paragraph} 段布局预检失败：${error instanceof Error ? error.message : String(error)}`,
              { cause: error },
            )
          missingFont = error.message
          progress(`第 ${pi + 1} 页第 ${p.paragraph} 段字体检查：${missingFont}`)
        }
      }
      if (!plan || plan.overflow) {
        signal.throwIfAborted()
        const reason = missingFont
          ? `字库无法覆盖译文字符。${missingFont}`
          : '译文按原字号和行距排版后超出可用区域'
        await retainWithMemo(
          p,
          pi,
          translation,
          reason,
          missingFont ? 'Memo：字库缺少译文字形' : 'Memo：译文超出原段落空间',
        )
        const memos = missingFont ? report.fontMemos : report.overflowMemos
        memos.push({ page: pi + 1, paragraph: p.paragraph })
        progress(
          `第 ${index + 1}/${jobs.length} 段${missingFont ? '字库缺字' : '空间不足'}：已保留原文并添加完整译文 Memo · 第 ${pi + 1} 页`,
        )
        continue
      }
      signal.throwIfAborted()
      stage = '段落写入'
      const applied = await applyTextEdits(translatedBytes, [plan.edit])
      if (applied.skipped.length)
        throw new Error(
          `第 ${pi + 1} 页第 ${p.paragraph} 段写入失败：${applied.skipped[0]!.reason}`,
        )
      stage = '写入后校验'
      const verification = await verifyTextEdits(applied.bytes, [plan.edit])
      if (verification.length) throw new Error(`第 ${pi + 1} 页第 ${p.paragraph} 段写入后校验失败`)
      if (!plan.sourceFontRetained)
        report.fontChanges.push({
          page: pi + 1,
          paragraph: p.paragraph,
          source: plan.sourceFont,
          actual: plan.actualFont,
        })
      translatedBytes = applied.bytes
      edits.push(plan.edit)
      report.translatedParagraphs = edits.length
      progress(
        `已写入并校验第 ${index + 1}/${jobs.length} 段 · 第 ${pi + 1} 页（保留原字号与行距）`,
      )
    } catch (error) {
      signal.throwIfAborted()
      const reason = `${stage}：${error instanceof Error ? error.message : String(error)}`
      report.skippedParagraphs.push({ page: pi + 1, paragraph: p.paragraph, reason, translation })
      progress(
        `第 ${pi + 1} 页第 ${p.paragraph} 段已跳过，保留原文并继续。${reason}\n原文：${p.text}\n译文：${translation}`,
      )
      try {
        await retainWithMemo(p, pi, translation, reason, 'Memo：段落处理失败，已保留原文')
      } catch (memoError) {
        signal.throwIfAborted()
        progress(`该段 Memo 添加失败，译文与错误原因已保留在日志及翻译报告：${String(memoError)}`)
      }
    }
  }
  signal.throwIfAborted()
  const original = await PDFDocument.load(source),
    translated = await PDFDocument.load(translatedBytes)
  const dual = await PDFDocument.create()
  for (let i = 0; i < original.getPageCount(); i++) {
    dual.addPage((await dual.copyPages(original, [i]))[0]!)
    dual.addPage((await dual.copyPages(translated, [i]))[0]!)
  }
  report.translatedParagraphs = edits.length
  progress(
    `已验证 ${edits.length} 段；保留 ${report.protectedRuns} 个公式/特殊文字对象；${report.overflowMemos.length + report.fontMemos.length} 段保留原文并添加 Memo；${report.fontChanges.length} 段使用覆盖目标语言的字体；${report.skippedParagraphs.length} 段处理失败已跳过（保留原文）。\n`,
  )
  return { mono: translatedBytes, dual: await dual.save(), report }
}
