/**
 * File actions extracted from App.tsx: save / save-as, image & PDF
 * export, and printing. Each function takes the ActionCtx built fresh per call.
 */
import type { RenderSlide } from '@genoffice/pptx-render'
import type { ActionCtx } from './action-context'
import { renderSlidesToPngBase64 } from './export-render'
import { getLang, t } from './i18n/locale'
import { showToast } from './components/toast-bus'

/**
 * If a text box/table is still being edited on ⌘S/close-save, blur first so the
 * overlay commits (blur→commitEdit), and save only after the commit lands —
 * otherwise we save pre-edit content and get a dirty-close prompt again.
 */
export async function flushActiveEdit(ctx: ActionCtx): Promise<void> {
  const active = document.activeElement as HTMLElement | null
  if (!active?.isContentEditable) return
  active.blur()
  for (let i = 0; i < 40 && ctx.editingActiveRef.current; i++) {
    await new Promise((r) => setTimeout(r, 50))
  }
}

/**
 * After save, the main process reopens the file with all-new element ids: swap
 * the render tree, mapping selection/edit state to new ids by per-page node ordinal.
 */
export function adoptSavedSlides(ctx: ActionCtx, next: RenderSlide[]): void {
  const remap = (id: string) => {
    const i = ctx.slides[ctx.current]?.nodes.findIndex((n) => n.sourceId === id) ?? -1
    return next[ctx.current]?.nodes[i]?.sourceId ?? null
  }
  ctx.setSelectedIds((ids) => ids.map(remap).filter((x): x is string => x !== null))
  ctx.setEnteredGroupId(null) // Group children ids can't be mapped by top-level ordinal; exit in-group editing after save
  ctx.setEditing((e) => (e && remap(e.sourceId) ? { sourceId: remap(e.sourceId)! } : e))
  ctx.setEditingCell((c) => (c && remap(c.sourceId) ? { ...c, sourceId: remap(c.sourceId)! } : c))
  ctx.setSlides(next)
}

export async function save(ctx: ActionCtx, quiet = false): Promise<boolean> {
  await flushActiveEdit(ctx)
  await ctx.flushNotes()
  const r = await window.slidesApi.save()
  if (r.ok) {
    if (r.slides) adoptSavedSlides(ctx, r.slides)
    if (r.path) ctx.setPath(r.path)
    ctx.setDirty(false)
    const saved = t('appStatusSaved', { name: r.path?.split('/').pop() ?? '' })
    ctx.setStatus(saved)
    if (!quiet) showToast(saved)
  } else {
    const failed = t('appStatusSaveFailed', { error: r.error ?? t('appErrorCanceled') })
    ctx.setStatus(failed)
    if (!quiet) showToast(failed, 'error')
  }
  return r.ok
}

export async function saveAs(ctx: ActionCtx): Promise<void> {
  await flushActiveEdit(ctx)
  await ctx.flushNotes()
  const name = ctx.path?.split('/').pop() ?? 'presentation.pptx'
  const r = await window.slidesApi.saveAs(name)
  if (r.ok) {
    if (r.slides) adoptSavedSlides(ctx, r.slides)
    ctx.setPath(r.path ?? ctx.path)
    ctx.setDirty(false)
    const saved = t('appStatusSavedAs', { name: r.path?.split('/').pop() ?? '' })
    ctx.setStatus(saved)
    showToast(saved)
  } else if (r.error) {
    // a canceled dialog returns ok:false without error — only real write
    // failures surface, matching the docs/sheets save-as feedback
    const failed = t('appStatusSaveFailed', { error: r.error })
    ctx.setStatus(failed)
    showToast(failed, 'error')
  }
}

/** Export base name: file name without the .pptx extension */
export function exportBaseName(ctx: ActionCtx): string {
  return (ctx.path?.split('/').pop() ?? t('appUntitledPresentation')).replace(/\.pptx$/i, '')
}

/** Export as images: each page (skipping hidden ones) rendered offscreen to 2x PNG, written to disk by the main process */
export async function exportImages(ctx: ActionCtx): Promise<void> {
  const visible = ctx.slides.filter((s) => !s.hidden)
  if (visible.length === 0) {
    ctx.setStatus(t('appExportNoSlides'))
    return
  }
  const dir = await window.slidesApi.pickExportDir()
  if (!dir) return
  ctx.setStatus(t('appExportImagesProgress', { count: visible.length }))
  try {
    const pngs = await renderSlidesToPngBase64(visible, ctx.images)
    const r = await window.slidesApi.exportImages({
      dir,
      baseName: exportBaseName(ctx),
      pngsBase64: pngs,
    })
    ctx.setStatus(
      r.ok
        ? t('appExportImagesDone', { count: r.paths?.length ?? 0, dir })
        : t('appExportImagesFailed', { error: r.error ?? t('appUnknownError') }),
    )
  } catch (err) {
    ctx.setStatus(t('appExportImagesFailed', { error: String(err) }))
  }
}

/** Export as PDF: each page (skipping hidden ones) rendered offscreen to 2x PNG; main process printToPDF in a hidden window */
export async function exportPdf(ctx: ActionCtx): Promise<void> {
  const visible = ctx.slides.filter((s) => !s.hidden)
  if (visible.length === 0) {
    ctx.setStatus(t('appExportNoSlides'))
    return
  }
  const target = await window.slidesApi.pickExportPdfPath(`${exportBaseName(ctx)}.pdf`)
  if (!target) return
  ctx.setStatus(t('appExportPdfProgress'))
  try {
    const pngs = await renderSlidesToPngBase64(visible, ctx.images)
    const r = await window.slidesApi.exportPdf({
      filePath: target,
      pngsBase64: pngs,
      widthPx: visible[0].widthPx,
      heightPx: visible[0].heightPx,
    })
    ctx.setStatus(
      r.ok
        ? t('appExportPdfDone', { path: r.path ?? '' })
        : t('appExportPdfFailed', { error: r.error ?? t('appUnknownError') }),
    )
  } catch (err) {
    ctx.setStatus(t('appExportPdfFailed', { error: String(err) }))
  }
}

/** Fixed-layout PPTX uses the PDF export's rendered page images and OfficeCLI.
 * Each page is one picture: it preserves appearance but is not element-editable. */
export async function exportVisualPptx(ctx: ActionCtx): Promise<void> {
  const zh = getLang() === 'zh'
  const visible = ctx.slides.filter((s) => !s.hidden)
  if (visible.length === 0) {
    ctx.setStatus(t('appExportNoSlides'))
    return
  }
  const target = await window.slidesApi.pickExportVisualPptxPath(
    `${exportBaseName(ctx)}-image.pptx`,
    'image',
  )
  if (!target) return
  ctx.setStatus(zh ? '正在导出整页图片保真 PPTX…' : 'Exporting visual PPTX…')
  try {
    const pngsBase64 = await renderSlidesToPngBase64(visible, ctx.images)
    const result = await window.slidesApi.exportVisualPptx({
      filePath: target,
      pngsBase64,
      widthPx: visible[0]!.widthPx,
      heightPx: visible[0]!.heightPx,
    })
    ctx.setStatus(
      result.ok
        ? zh
          ? `整页图片保真 PPTX 已保存：${result.path}`
          : `Visual PPTX saved: ${result.path}`
        : zh
          ? `整页图片保真 PPTX 导出失败：${result.error}`
          : `Visual PPTX export failed: ${result.error}`,
    )
  } catch (error) {
    ctx.setStatus(
      zh
        ? `整页图片保真 PPTX 导出失败：${String(error)}`
        : `Visual PPTX export failed: ${String(error)}`,
    )
  }
}

/** Print: after picking a layout (full page/handout/notes), reuse the PDF offscreen rendering pipeline through the system print dialog */
export async function printSlides(
  ctx: ActionCtx,
  layout: 'full' | 'handout2' | 'handout3' | 'handout6' | 'notes',
): Promise<void> {
  const visible = ctx.slides.filter((s) => !s.hidden)
  if (visible.length === 0) {
    ctx.setStatus(t('appExportNoSlides'))
    return
  }
  ctx.setStatus(t('appPrintProgress'))
  try {
    const pngs = await renderSlidesToPngBase64(visible, ctx.images)
    // The notes layout must take notes text by visible page (hidden pages filtered; indexes must map back to original pages)
    const notes =
      layout === 'notes'
        ? await Promise.all(
            ctx.slides.flatMap((sl, i) => (sl.hidden ? [] : [window.slidesApi.getNotes(i)])),
          )
        : undefined
    const r = await window.slidesApi.printSlides({
      pngsBase64: pngs,
      widthPx: visible[0].widthPx,
      heightPx: visible[0].heightPx,
      layout,
      ...(notes ? { notes } : {}),
    })
    ctx.setStatus(r.ok ? '' : t('appPrintFailed', { error: r.error ?? t('appUnknownError') }))
  } catch (err) {
    ctx.setStatus(t('appPrintFailed', { error: String(err) }))
  }
}

let compatibleExportRunning = false

/** 独立导出不修改正在编辑的会话、路径或 dirty 标志。 */
export async function exportCompatiblePptx(ctx: ActionCtx): Promise<void> {
  const zh = getLang() === 'zh'
  if (compatibleExportRunning) return
  compatibleExportRunning = true
  try {
    await flushActiveEdit(ctx)
    await ctx.flushNotes()
    const target = await window.slidesApi.pickExportVisualPptxPath(
      `${exportBaseName(ctx)}-editable.pptx`,
      'editable',
    )
    if (!target) return
    ctx.setStatus(zh ? '正在捕获原生导出快照…' : 'Capturing native export snapshot…')
    const snapshot = await window.slidesApi.prepareCompatiblePptx()
    await document.fonts.ready
    // 重新打开快照后媒体 id 可能改变，必须按快照的数据 URL 加载，不能沿用旧 id。
    const images = new Map(ctx.images)
    const urls = new Set<string>()
    const collect = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (key === 'dataUrl' && typeof child === 'string') urls.add(child)
        else collect(child)
      }
    }
    collect(snapshot.slides)
    await Promise.all(
      [...urls].map(async (url) => {
        if (images.get(url)?.complete) return
        const image = new Image()
        image.src = url
        await image.decode()
        images.set(url, image)
      }),
    )
    ctx.setStatus(zh ? '正在生成逐页参考图…' : 'Rendering source references…')
    const pngsBase64 = await renderSlidesToPngBase64(snapshot.slides, images, 1)
    ctx.setStatus(
      zh ? '正在使用 LibreOffice 独立渲染并校验版式…' : 'Auditing layout with LibreOffice…',
    )
    const candidates = []
    for (const candidate of snapshot.candidates) {
      const slide = snapshot.slides[candidate.slideIndex]
      const node = slide?.nodes.find((item) => item.sourceId === candidate.sourceId)
      if (!node || node.type !== 'shape') continue
      const [pngBase64] = await renderSlidesToPngBase64(
        [{ ...slide, nodes: [node] }],
        images,
        1,
        true,
      )
      candidates.push({ ...candidate, pngBase64 })
    }
    const result = await window.slidesApi.exportCompatiblePptx({
      filePath: target,
      bytes: snapshot.bytes,
      pngsBase64,
      candidates,
    })
    if (!result.ok) throw new Error(result.error || t('appUnknownError'))
    if (!result.path)
      throw new Error(zh ? '未确认保存文件路径' : 'Saved file path was not confirmed')
    const status =
      result.layoutStatus === 'unavailable'
        ? zh
          ? '文件已保存；未能执行独立版式检查（请查看报告）'
          : 'File saved; independent layout check unavailable (see report)'
        : result.layoutStatus === 'passed'
          ? zh
            ? '版式检查通过'
            : 'Layout check passed'
          : zh
            ? '版式需复核，详见报告'
            : 'Layout needs review; see report'
    const message = `${status}: ${result.path}; ${result.reportPath}`
    ctx.setStatus(message)
    showToast(message)
  } catch (error) {
    const message = zh
      ? `可编辑导出失败：${String(error)}`
      : `Editable export failed: ${String(error)}`
    ctx.setStatus(message)
    showToast(message, 'error')
  } finally {
    compatibleExportRunning = false
  }
}
