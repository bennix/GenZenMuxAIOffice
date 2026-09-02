/**
 * Insert-tab actions extracted from App.tsx: shapes/text boxes,
 * images, tables, icons, charts, SmartArt, WordArt, fields, links, Zoom,
 * header/footer, equations, media, 3D models, and screen recording.
 * Functions take the ActionCtx built fresh per call.
 */
import type { InsertKind, LinkTargetOp } from '../shared/ipc'
import type { ActionCtx } from './action-context'
import { latexEquationDescr, renderLatexEquationPng } from './latex-equation'
import { applySelectionLink, saveEditSelection, selectionLink } from './TextEditOverlay'
import { FIT_WIDTH } from './app-constants'
import type { WordArtPreset } from '@genoffice/ui'
import {
  chartSampleData,
  iconSvg,
  type ChartPresetDef,
  type IconDef,
  type SmartArtDef,
} from './insert-presets'
import { t } from './i18n/locale'
import { isLineDrawKind, type DrawRect } from './draw-shape'
import type { PresentationRecordingOptions } from './components/PresentationRecording'
import { presentationMp4Mime, recordingFileName } from './presentation-recording'

/** Draw-mode commit: insert a gallery shape at the drawn box (PowerPoint click-or-drag sizing). */
export async function insertShapeAt(
  ctx: ActionCtx,
  kind: InsertKind,
  rect: DrawRect,
): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const isLine = isLineDrawKind(kind)
  const r = await window.slidesApi.addElement({
    slideIndex: current,
    kind,
    xPx: Math.round(rect.x),
    yPx: Math.round(rect.y),
    wPx: Math.round(rect.w),
    hPx: Math.round(rect.h),
    fitWidthPx: FIT_WIDTH,
    ...(isLine ? { stroke: { color: '#000000', widthPt: 1 } } : { fillColor: '#C43E1C' }),
  })
  if (!r) return
  let updated = r.slide
  // Connectors render top-left → bottom-right inside their box; leftward/upward drags are restored by mirroring
  for (const axis of [
    ...(rect.flipH ? (['h'] as const) : []),
    ...(rect.flipV ? (['v'] as const) : []),
  ]) {
    const f = await window.slidesApi.flipElements({
      slideIndex: current,
      sourceIds: [r.sourceId],
      axis,
    })
    if (f) updated = f
  }
  ctx.applySlide(current, updated)
  ctx.setSelectedIds([r.sourceId])
}

export async function insertElement(ctx: ActionCtx, kind: InsertKind): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  // Lines insert as a horizontal stroke-only connector (no fill, no text);
  // bent/curved connectors need a real box for their elbow/curve geometry
  const isStraightLine = kind === 'line' || kind === 'lineArrow' || kind === 'lineArrowDouble'
  const isLine = isStraightLine || kind === 'lineBent' || kind === 'lineCurved'
  const w = kind === 'textbox' ? 360 : 240
  const h = kind === 'textbox' ? 60 : isStraightLine ? 0 : 160
  const r = await window.slidesApi.addElement({
    slideIndex: current,
    kind,
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
    ...(kind === 'textbox'
      ? { text: '' }
      : isLine
        ? { stroke: { color: '#000000', widthPt: 1 } }
        : { fillColor: '#C43E1C' }),
  })
  if (r) {
    ctx.applySlide(current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    if (kind === 'textbox') ctx.setEditing({ sourceId: r.sourceId })
  }
}

export async function insertImage(ctx: ActionCtx): Promise<void> {
  if (!ctx.slide) return
  const r = await window.slidesApi.insertImage(ctx.current, FIT_WIDTH)
  if (!r) return
  if ('error' in r) {
    ctx.setSelectedIds([])
    ctx.setStatus(t('appStatusImageUnsupported', { ext: r.ext.toUpperCase() }))
    return
  }
  ctx.applySlide(ctx.current, r.slide)
  ctx.setSelectedIds([r.sourceId])
}

/** Insert the studio export as an ordinary PPT picture so it remains movable and resizable. */
export async function insertInfographic(
  ctx: ActionCtx,
  dataUrl: string,
  naturalWidth: number,
  naturalHeight: number,
): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  if (!base64 || base64 === dataUrl) return
  const maxW = slide.widthPx * 0.76
  const maxH = slide.heightPx * 0.68
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight)
  const w = Math.round(naturalWidth * scale)
  const h = Math.round(naturalHeight * scale)
  const r = await window.slidesApi.addImageBytes({
    slideIndex: current,
    base64,
    ext: 'png',
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
    name: 'ZenOffice Infographic',
  })
  if (r && !('error' in r)) {
    ctx.applySlide(current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setDirty(true)
    ctx.setStatus('Infographic inserted')
  }
}

export async function insertTable(ctx: ActionCtx, rows: number, cols: number): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const w = Math.min(Math.round(slide.widthPx * 0.7), 760)
  const h = Math.min(Math.round(slide.heightPx * 0.6), rows * 44)
  const r = await window.slidesApi.addTable({
    slideIndex: current,
    rows,
    cols,
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
  })
  if (r) {
    ctx.applySlide(current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setStatus(t('appStatusTableInserted', { rows, cols }))
  }
}

/** Icons: SVG rasterized to PNG then inserted as an image (embedded PNG has the best pptx compatibility). */
export async function insertIcon(ctx: ActionCtx, def: IconDef, color: string): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  try {
    const svg = iconSvg(def, color)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg decode failed'))
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
    })
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    canvas.getContext('2d')!.drawImage(img, 0, 0, 512, 512)
    const base64 = canvas.toDataURL('image/png').split(',')[1]!
    const size = 96
    const r = await window.slidesApi.addImageBytes({
      slideIndex: current,
      base64,
      ext: 'png',
      xPx: Math.round((slide.widthPx - size) / 2),
      yPx: Math.round((slide.heightPx - size) / 2),
      wPx: size,
      hPx: size,
      fitWidthPx: FIT_WIDTH,
      name: `Icon ${def.name}`,
    })
    if (r && !('error' in r)) {
      ctx.applySlide(current, r.slide)
      ctx.setSelectedIds([r.sourceId])
      ctx.setStatus(t('appStatusIconInserted', { name: def.name }))
    }
  } catch {
    ctx.setStatus(t('appStatusIconInsertFailed'))
  }
}

export async function insertChart(ctx: ActionCtx, kind: ChartPresetDef['kind']): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const data = chartSampleData(kind)
  const w = Math.round(slide.widthPx * 0.62)
  const h = Math.round(slide.heightPx * 0.62)
  const r = await window.slidesApi.addChart({
    slideIndex: current,
    kind,
    categories: data.categories,
    series: data.series,
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
  })
  if (r) {
    ctx.applySlide(current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setStatus(t('appStatusChartInserted'))
  }
}

export async function insertSmartArt(ctx: ActionCtx, def: SmartArtDef): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const w = Math.round(slide.widthPx * 0.7)
  const h = Math.round(slide.heightPx * 0.5)
  const r = await window.slidesApi.addSmartArt({
    slideIndex: current,
    layout: def.layout,
    items: def.defaultItems,
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
  })
  if (r) {
    ctx.applySlide(current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setStatus(t('appStatusSmartArtInserted', { name: def.label }))
  }
}

export async function insertWordArt(ctx: ActionCtx, preset: WordArtPreset): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const w = 520
  const h = 100
  const r = await window.slidesApi.addElement({
    slideIndex: current,
    kind: 'textbox',
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
    paragraphs: [
      {
        align: 'center',
        runs: [
          {
            text: t('appWordArtPlaceholder'),
            fontSize: 40,
            bold: preset.bold,
            italic: preset.italic,
            color: preset.fill,
            ...(preset.outline ? { outline: preset.outline } : {}),
          },
        ],
      },
    ],
  })
  if (r) {
    ctx.applySlide(current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setStatus(t('appStatusWordArtInserted'))
  }
}

/** Date-time / slide number: <a:fld> dynamic fields, auto-refreshed when PowerPoint opens the file. */
export async function insertField(ctx: ActionCtx, type: 'datetime' | 'slidenum'): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const isDate = type === 'datetime'
  const w = isDate ? 240 : 100
  const h = 44
  const r = await window.slidesApi.addElement({
    slideIndex: current,
    kind: 'textbox',
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
    paragraphs: [
      {
        align: 'center',
        runs: [
          {
            text: isDate ? new Date().toLocaleDateString() : String(current + 1),
            fontSize: 18,
            field: isDate ? 'datetime1' : 'slidenum',
          },
        ],
      },
    ],
  })
  if (r) {
    ctx.applySlide(current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setStatus(isDate ? t('appStatusDateInserted') : t('appStatusSlideNumInserted'))
  }
}

export async function openLinkDialog(ctx: ActionCtx): Promise<void> {
  if (!ctx.slide) return
  // Editing text: the link applies to the selection (run-level); the keep-edit ribbon
  // button / dialog keep the editor alive, saveEditSelection preserved the range
  if (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable) {
    saveEditSelection()
    ctx.setLinkDialog({ sourceId: null, run: true, initial: selectionLink() })
    return
  }
  if (ctx.selectedIds.length !== 1) return
  const sourceId = ctx.selectedIds[0]!
  const initial = await window.slidesApi.getLink(ctx.current, sourceId)
  ctx.setLinkDialog({ sourceId, initial })
}

export async function applyLink(ctx: ActionCtx, target: LinkTargetOp | null): Promise<void> {
  if (!ctx.linkDialog) return
  if (ctx.linkDialog.run) {
    const ok = applySelectionLink(target)
    ctx.setLinkDialog(null)
    if (ok) ctx.setStatus(target ? t('appStatusLinkSet') : t('appStatusLinkRemoved'))
    return
  }
  if (!ctx.linkDialog.sourceId) return
  const updated = await window.slidesApi.setLink({
    slideIndex: ctx.current,
    sourceId: ctx.linkDialog.sourceId,
    target,
  })
  ctx.setLinkDialog(null)
  if (updated) {
    ctx.applySlide(ctx.current, updated)
    ctx.setStatus(target ? t('appStatusLinkSet') : t('appStatusLinkRemoved'))
  }
}

/** Zoom link (simplified Zoom): a button shape with an internal jump link. */
export async function insertZoom(ctx: ActionCtx, target: number): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const w = 200
  const h = 60
  const r = await window.slidesApi.addElement({
    slideIndex: current,
    kind: 'roundRect',
    xPx: slide.widthPx - w - 28,
    yPx: slide.heightPx - h - 28,
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
    fillColor: '#4472C4',
    paragraphs: [
      {
        align: 'center',
        runs: [
          {
            text: t('appZoomButtonText', { page: target + 1 }),
            fontSize: 17,
            bold: true,
            color: '#FFFFFF',
          },
        ],
      },
    ],
  })
  if (!r) return
  const linked = await window.slidesApi.setLink({
    slideIndex: current,
    sourceId: r.sourceId,
    target: { kind: 'slide', slideIndex: target },
  })
  ctx.applySlide(current, linked ?? r.slide)
  ctx.setStatus(t('appStatusZoomInserted', { page: target + 1 }))
}

export async function openHeaderFooter(ctx: ActionCtx): Promise<void> {
  if (!ctx.slide) return
  ctx.setHfDialog(await window.slidesApi.getHeaderFooter(ctx.current))
}

export async function applyHf(
  ctx: ActionCtx,
  opts: { footer: string | null; slideNum: boolean; date: string | null; dateAuto: boolean },
): Promise<void> {
  ctx.setHfDialog(null)
  const updated = await window.slidesApi.applyHeaderFooter({ ...opts, fitWidthPx: FIT_WIDTH })
  if (updated) {
    ctx.setSlides(updated)
    ctx.setSelectedIds([])
    ctx.setEditing(null)
    ctx.setDirty(true)
    ctx.setStatus(t('appStatusHfApplied'))
  } else {
    ctx.setStatus(t('appStatusHfUnchanged'))
  }
}

/** Equations: rasterized MathML for broad PPTX compatibility; LaTeX source stays in cNvPr metadata. */
export async function insertEquation(
  ctx: ActionCtx,
  latex: string,
  editSourceId?: string,
): Promise<void> {
  ctx.setEqDialogOpen(false)
  const { slide, current } = ctx
  if (!slide) return
  try {
    const rendered = await renderLatexEquationPng(latex)
    const descr = latexEquationDescr(latex)
    if (editSourceId) {
      const updated = await window.slidesApi.replacePictureBytes({
        slideIndex: current,
        sourceId: editSourceId,
        base64: rendered.base64,
        ext: 'png',
        descr,
      })
      if (updated && !('error' in updated)) {
        ctx.applySlide(current, updated)
        ctx.setSelectedIds([editSourceId])
        ctx.setDirty(true)
        ctx.setStatus(t('appStatusEquationInserted'))
      }
      return
    }
    const scale = Math.min(1, (slide.widthPx * 0.72) / rendered.widthPx)
    const w = Math.max(48, rendered.widthPx * scale)
    const h = Math.max(48, rendered.heightPx * scale)
    const r = await window.slidesApi.addImageBytes({
      slideIndex: current,
      base64: rendered.base64,
      ext: 'png',
      xPx: Math.round((slide.widthPx - w) / 2),
      yPx: Math.round((slide.heightPx - h) / 2),
      wPx: w,
      hPx: h,
      fitWidthPx: FIT_WIDTH,
      name: 'LaTeX Equation',
      descr,
    })
    if (r && !('error' in r)) {
      ctx.applySlide(current, r.slide)
      ctx.setSelectedIds([r.sourceId])
      ctx.setDirty(true)
      ctx.setStatus(t('appStatusEquationInserted'))
    }
  } catch (error) {
    ctx.setStatus(error instanceof Error ? error.message : String(error))
  }
}

export async function insertMediaFile(ctx: ActionCtx, kind: 'video' | 'audio'): Promise<void> {
  if (!ctx.slide) return
  const r = await window.slidesApi.insertMedia(ctx.current, kind, FIT_WIDTH)
  if (r) {
    ctx.applySlide(ctx.current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setStatus(kind === 'video' ? t('appStatusVideoInserted') : t('appStatusAudioInserted'))
  }
}

export async function insertModel3dFile(ctx: ActionCtx): Promise<void> {
  if (!ctx.slide) return
  const r = await window.slidesApi.insertModel3d(ctx.current, FIT_WIDTH)
  if (r) {
    ctx.applySlide(ctx.current, r.slide)
    ctx.setSelectedIds([r.sourceId])
    ctx.setStatus(t('appStatusModel3dInserted'))
  }
}

function stopRecordingTracks(ctx: ActionCtx): void {
  const state = ctx.recorderRef.current
  state?.stream.getTracks().forEach((track) => track.stop())
  state?.displayStream.getTracks().forEach((track) => track.stop())
  state?.microphoneStream?.getTracks().forEach((track) => track.stop())
  if (state?.audioContext && state.audioContext.state !== 'closed') {
    void state.audioContext.close()
  }
}

/** Record a full-screen presentation plus optional microphone narration to a real MP4 file. */
export async function startPresentationRecording(
  ctx: ActionCtx,
  options: PresentationRecordingOptions,
): Promise<boolean> {
  if (!ctx.slide || ctx.recorderRef.current) return false
  const mimeType = presentationMp4Mime()
  if (!mimeType) {
    ctx.setStatus('当前系统的视频编码器不支持 MP4，无法开始录制。请更新 ZenOffice 或系统后重试。')
    return false
  }
  let displayStream: MediaStream | null = null
  let microphoneStream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let recordingId: string | null = null
  try {
    if (options.microphone) {
      const permission = await window.slidesApi.requestPresentationMicrophonePermission()
      if (permission.status !== 'granted') {
        throw new Error(
          '麦克风权限未授予。请打开“系统设置 → 隐私与安全性 → 麦克风”，允许 ZenOffice 使用麦克风后重新启动应用。',
        )
      }
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const microphoneTrack = microphoneStream.getAudioTracks()[0]
      if (!microphoneTrack || microphoneTrack.readyState !== 'live') {
        throw new Error('未能取得可用的麦克风音轨，请检查所选输入设备。')
      }
    }
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: options.systemAudio,
    })
    if (options.systemAudio && displayStream.getAudioTracks().length === 0) {
      throw new Error(
        '未取得演示文稿音轨。macOS 可录制 ZenOffice 幻灯片中播放的视频和音频；请确认媒体正在播放后重试。',
      )
    }
    const audioStreams = [displayStream, microphoneStream].filter(
      (candidate): candidate is MediaStream => !!candidate?.getAudioTracks().length,
    )
    let audioTracks: MediaStreamTrack[] = []
    if (audioStreams.length === 1) {
      audioTracks = audioStreams[0]!.getAudioTracks()
    } else if (audioStreams.length > 1) {
      audioContext = new AudioContext()
      await audioContext.resume()
      const destination = audioContext.createMediaStreamDestination()
      for (const sourceStream of audioStreams) {
        const gain = audioContext.createGain()
        gain.gain.value = 0.75
        audioContext.createMediaStreamSource(sourceStream).connect(gain).connect(destination)
      }
      audioTracks = destination.stream.getAudioTracks()
    }
    const stream = new MediaStream([...displayStream.getVideoTracks(), ...audioTracks])
    const started = await window.slidesApi.beginPresentationRecording(mimeType)
    if (!started) throw new Error('Unable to create the local recording file')
    recordingId = started.id
    const rec = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 192_000,
    })
    const state = {
      rec,
      stream,
      displayStream,
      microphoneStream,
      audioContext,
      recordingId: started.id,
      writeQueue: Promise.resolve(),
      canceled: false,
      startedAt: 0,
      pausedAt: null,
      pausedTotalMs: 0,
    }
    rec.ondataavailable = (ev) => {
      if (ev.data.size === 0) return
      state.writeQueue = state.writeQueue.then(async () => {
        const bytes = new Uint8Array(await ev.data.arrayBuffer())
        const ok = await window.slidesApi.appendPresentationRecording(started.id, bytes)
        if (!ok) throw new Error('Unable to write the local recording file')
      })
    }
    rec.onstop = async () => {
      stopRecordingTracks(ctx)
      ctx.setSlideShow(null)
      ctx.setRecordingPaused(false)
      try {
        await state.writeQueue
        if (state.canceled) {
          await window.slidesApi.cancelPresentationRecording(started.id)
          ctx.setStatus('已取消录制，临时文件已删除')
        } else {
          ctx.setStatus('录制完成，正在准备 MP4 导出…')
          // Let fullscreen close before opening the native save sheet, especially on macOS.
          await new Promise((resolve) => window.setTimeout(resolve, 200))
          const result = await window.slidesApi.finishPresentationRecording(
            started.id,
            recordingFileName(ctx.path),
          )
          if (result.ok && result.path) ctx.setStatus(`MP4 已导出：${result.path}`)
          else if (result.canceled) ctx.setStatus('已取消 MP4 导出')
          else ctx.setStatus(`MP4 导出失败：${result.error ?? '未知错误'}`)
        }
      } catch (error) {
        await window.slidesApi.cancelPresentationRecording(started.id)
        ctx.setStatus(`MP4 导出失败：${String(error)}`)
      } finally {
        ctx.recorderRef.current = null
        ctx.setRecording(false)
        ctx.setRecordingPaused(false)
        ctx.setRecordingStartedAt(0)
      }
    }
    displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (rec.state !== 'inactive') rec.stop()
    })
    ctx.setStatus('录制将在 3 秒后开始…')
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    ctx.setStatus('录制将在 2 秒后开始…')
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    ctx.setStatus('录制将在 1 秒后开始…')
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    rec.start(1000)
    state.startedAt = Date.now()
    ctx.recorderRef.current = state
    ctx.setRecording(true)
    ctx.setRecordingPaused(false)
    ctx.setRecordingStartedAt(state.startedAt)
    ctx.setEditing(null)
    ctx.setCtxMenu(null)
    const first = ctx.slides.findIndex((slide) => !slide.hidden)
    ctx.setSlideShow({ startAt: options.fromStart ? Math.max(0, first) : ctx.current })
    const audioLabel = [options.microphone ? '麦克风' : '', options.systemAudio ? '系统声音' : '']
      .filter(Boolean)
      .join('和')
    ctx.setStatus(`正在录制演示${audioLabel ? `、${audioLabel}` : ''}…`)
    return true
  } catch (error) {
    displayStream?.getTracks().forEach((track) => track.stop())
    microphoneStream?.getTracks().forEach((track) => track.stop())
    if (audioContext && audioContext.state !== 'closed') await audioContext.close()
    if (recordingId) await window.slidesApi.cancelPresentationRecording(recordingId)
    ctx.setStatus(`无法开始录制（权限未授予、未选择屏幕或设备不可用）：${String(error)}`)
    return false
  }
}

export function pauseResumePresentationRecording(ctx: ActionCtx): void {
  const rec = ctx.recorderRef.current?.rec
  if (!rec || rec.state === 'inactive') return
  if (rec.state === 'paused') {
    const state = ctx.recorderRef.current!
    rec.resume()
    if (state.pausedAt != null) state.pausedTotalMs += Date.now() - state.pausedAt
    state.pausedAt = null
    ctx.setRecordingPaused(false)
    ctx.setStatus('已继续录制')
  } else {
    ctx.recorderRef.current!.pausedAt = Date.now()
    rec.pause()
    ctx.setRecordingPaused(true)
    ctx.setStatus('录制已暂停')
  }
}

export function stopPresentationRecording(ctx: ActionCtx): void {
  const rec = ctx.recorderRef.current?.rec
  if (rec && rec.state !== 'inactive') rec.stop()
}

export function cancelPresentationRecording(ctx: ActionCtx): void {
  const state = ctx.recorderRef.current
  if (!state) return
  state.canceled = true
  if (state.rec.state !== 'inactive') state.rec.stop()
}
