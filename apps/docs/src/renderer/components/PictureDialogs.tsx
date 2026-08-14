/**
 * Picture Format dialogs: remove background (tolerance cutout) + crop.
 *
 * Remove background: same interaction as slides' CutoutDialog — a tolerance slider with live
 * preview; the preview computes on a ≤520px downsampled copy, applying recomputes at the
 * original resolution and returns a transparent PNG dataUrl.
 *
 * Crop: drag 8 handles on the preview (or drag inside the box to move) to pick the kept
 * region; applying bakes the selection into a new dataUrl at the original resolution
 * (png keeps transparency, jpeg stays jpeg). Reuses the .modal-backdrop/.modal styles.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { removeBackground, sampleBackgroundColors, type PixelImage, type RGB } from '../cutout'
import { useI18n, type StringKey } from '../i18n/locale'

/** Longest side of the preview canvas (px) */
const PREVIEW_MAX = 520
const DEFAULT_TOLERANCE = 30
const CROP_HANDLE_GUTTER = 6

export function fitCropPreview(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = PREVIEW_MAX,
  maxHeight = PREVIEW_MAX,
): { w: number; h: number } {
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight)
  return {
    w: Math.max(1, Math.round(naturalWidth * scale)),
    h: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

/* ================= ZenMux AI scan enhancement ================= */

type ScanEnhanceMode = 'handwriting' | 'scan'

interface AiScanEnhanceProps {
  dataUrl: string
  onApply: (enhancedDataUrl: string) => void
  onCancel: () => void
}

const SCAN_ENHANCE_PROMPTS: Record<ScanEnhanceMode, string> = {
  handwriting:
    'HIGH-FIDELITY DOCUMENT CLEANUP. Treat the attached image as the immutable source canvas; this is an image edit, never a new composition. Remove only handwriting, handwritten signatures, pen or pencil strokes, scribbles, manual highlights, and handwritten corrections. Handwriting may be written directly over printed text, equations, tables, charts, or diagrams: separate only the overlaid handwritten ink and restore an occluded printed stroke solely when its continuation is visually supported by the immediately adjacent source pixels. Never erase the whole printed item, complete a word or formula from meaning, or replace it with semantically guessed content. When the underlying mark is ambiguous, preserve all visible printed pixels and make the smallest conservative cleanup instead of inventing a reconstruction. Preserve every printed glyph, number, equation, table line, diagram, stamp, logo, margin, crop, page dimension, and blank area at the exact same position and scale. Do not add, regenerate, infer, rewrite, translate, sharpen into different glyphs, or invent any printed content. If an area contains handwriting but no printed content, replace it only with the matching blank paper background. If the entire source contains only handwriting, the correct result is the same blank page after removal—never invent a document, book page, or text. Output a pixel-faithful cleaned scan with identical geometry.',
  scan: 'HIGH-FIDELITY BLACK-AND-WHITE SCAN RESTORATION. Treat the attached image as the immutable source canvas; enhance the same pixels and never create a new composition. Preserve every printed glyph, number, punctuation mark, equation, table, diagram, stamp, logo, margin, crop, page dimension, blank area, and relative position exactly. Only correct uneven illumination or perspective and remove paper gray cast, dust, bleed-through, shadows, speckles, and scanner noise; improve contrast conservatively without changing character shapes. Do not add or remove handwriting in this mode. Do not add, regenerate, infer, rewrite, translate, summarize, omit, or invent any content. Output the same page with identical geometry and faithful printed content, only cleaner and more legible.',
}

function parseImageDataUrl(dataUrl: string): { base64: string; mime: string } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl)
  if (!match) return null
  return { mime: match[1].toLowerCase(), base64: match[2].replace(/\s/g, '') }
}

export function AiScanEnhanceDialog({ dataUrl, onApply, onCancel }: AiScanEnhanceProps) {
  const { lang } = useI18n()
  const zh = lang === 'zh' || lang === 'zh-TW'
  const [mode, setMode] = useState<ScanEnhanceMode>('handwriting')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !processing) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, processing])

  const generate = async () => {
    const reference = parseImageDataUrl(dataUrl)
    if (!reference) {
      setError(
        zh
          ? '此图片格式不支持 AI 增强，请先转换为 PNG、JPEG 或 WebP。'
          : 'Convert this image to PNG, JPEG, or WebP before AI enhancement.',
      )
      return
    }
    setProcessing(true)
    setError(null)
    setResult(null)
    try {
      const response = await window.desktop.generateImage({
        model: 'openai/gpt-image-2',
        prompt: SCAN_ENHANCE_PROMPTS[mode],
        referenceImages: [reference],
        imageSize: '2K',
      })
      if (response.error) throw new Error(response.error)
      if (response.base64) {
        setResult(`data:${response.mime || 'image/png'};base64,${response.base64}`)
      } else if (response.url) {
        const downloaded = await window.desktop.fetchImage(response.url)
        if (!downloaded) {
          throw new Error(zh ? '无法下载 AI 返回的图片。' : 'Could not download the AI result.')
        }
        setResult(`data:${downloaded.mime};base64,${downloaded.base64}`)
      } else {
        throw new Error(zh ? 'AI 没有返回图片。' : 'The AI did not return an image.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !processing && onCancel()}>
      <div className="modal" style={{ maxWidth: 920 }} onClick={(e) => e.stopPropagation()}>
        <h2>{zh ? 'ZenMux AI 扫描增强' : 'ZenMux AI Scan Enhancement'}</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className={`scan-mode-option${mode === 'handwriting' ? ' selected' : ''}`}
            aria-pressed={mode === 'handwriting'}
            disabled={processing}
            onClick={() => setMode('handwriting')}
          >
            {zh ? '去除手写痕迹（含覆盖印刷内容）' : 'Remove Handwriting (including overlays)'}
          </button>
          <button
            className={`scan-mode-option${mode === 'scan' ? ' selected' : ''}`}
            aria-pressed={mode === 'scan'}
            disabled={processing}
            onClick={() => setMode('scan')}
          >
            {zh ? '黑白扫描件增强' : 'Enhance B&W Scan'}
          </button>
          <span
            style={{
              marginLeft: 'auto',
              color: 'var(--text-muted)',
              fontSize: 12,
              alignSelf: 'center',
            }}
          >
            ZenMux · openai/gpt-image-2
          </span>
        </div>
        {mode === 'handwriting' && (
          <p className="scan-enhance-note">
            {zh
              ? '手写可以位于空白处，也可以覆盖在印刷字、公式、表格线或图形上。处理会优先保留原始印刷内容，只对有局部笔画依据的遮挡部分进行保守修复。'
              : 'Handwriting may be on blank paper or over printed text, equations, table rules, or diagrams. Printed source content is preserved first; occluded strokes are repaired conservatively only when nearby pixels support them.'}
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <figure style={{ margin: 0 }}>
            <figcaption style={{ marginBottom: 6 }}>{zh ? '原图' : 'Original'}</figcaption>
            <div
              style={{
                height: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-subtle)',
                overflow: 'hidden',
              }}
            >
              <img
                src={dataUrl}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          </figure>
          <figure style={{ margin: 0 }}>
            <figcaption style={{ marginBottom: 6 }}>
              {zh ? '处理结果（应用前预览）' : 'Result (preview before applying)'}
            </figcaption>
            <div
              style={{
                height: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-subtle)',
                overflow: 'hidden',
              }}
            >
              {result ? (
                <img
                  src={result}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                  {processing
                    ? zh
                      ? 'AI 正在处理…'
                      : 'AI is processing…'
                    : zh
                      ? '选择处理方式后点击“生成预览”'
                      : 'Choose a mode and generate a preview'}
                </span>
              )}
            </div>
          </figure>
        </div>
        <p
          style={{
            color: error ? 'var(--danger)' : 'var(--text-muted)',
            fontSize: 12,
            margin: '10px 0 0',
          }}
        >
          {error ||
            (zh
              ? 'AI 可能改变细节或文字，请在应用前仔细检查；功能可能受网络状况影响。'
              : 'AI may alter details or text. Review before applying; availability may be affected by network conditions.')}
        </p>
        <div className="modal-actions">
          <button onClick={onCancel} disabled={processing}>
            {zh ? '取消' : 'Cancel'}
          </button>
          <button onClick={() => void generate()} disabled={processing}>
            {processing ? (zh ? '处理中…' : 'Processing…') : zh ? '生成预览' : 'Generate Preview'}
          </button>
          <button
            className="primary"
            onClick={() => result && onApply(result)}
            disabled={!result || processing}
          >
            {zh ? '应用到文档' : 'Apply to Document'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Checkerboard backdrop: visualizes transparent areas */
const CHECKERBOARD: React.CSSProperties = {
  background: 'repeating-conic-gradient(#d5d5d5 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px',
}

/* ================= Remove background ================= */

interface CutoutProps {
  dataUrl: string
  /** Apply: the background-removed PNG dataUrl (with alpha channel) */
  onApply: (pngDataUrl: string) => void
  onCancel: () => void
}

export function CutoutDialog({ dataUrl, onApply, onCancel }: CutoutProps) {
  const { t } = useI18n()
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<StringKey | null>(null)
  const [removedPct, setRemovedPct] = useState(0)
  const [applying, setApplying] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Original-resolution pixels (used on apply) */
  const fullRef = useRef<PixelImage | null>(null)
  /** Downsampled pixels (for the slider's live preview) */
  const previewRef = useRef<PixelImage | null>(null)
  /** Background representative colors (from original-resolution border sampling, shared by preview/apply for consistency) */
  const bgColorsRef = useRef<RGB[]>([])
  const rafRef = useRef<number | null>(null)

  const renderPreview = useCallback((tol: number) => {
    const pv = previewRef.current
    const canvas = canvasRef.current
    if (!pv || !canvas) return
    const result = removeBackground(pv, tol, bgColorsRef.current)
    canvas.getContext('2d')!.putImageData(new ImageData(result.data, pv.width, pv.height), 0, 0)
    setRemovedPct(Math.round((result.removedCount / (pv.width * pv.height)) * 100))
  }, [])

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h) {
        setError('ribbonImageLoadFail')
        return
      }
      const grab = (dw: number, dh: number): PixelImage => {
        const c = document.createElement('canvas')
        c.width = dw
        c.height = dh
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0, dw, dh)
        const d = ctx.getImageData(0, 0, dw, dh)
        return { data: d.data, width: dw, height: dh }
      }
      const full = grab(w, h)
      const scale = Math.min(1, PREVIEW_MAX / Math.max(w, h))
      const preview =
        scale < 1
          ? grab(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
          : full
      fullRef.current = full
      previewRef.current = preview
      bgColorsRef.current = sampleBackgroundColors(full)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = preview.width
        canvas.height = preview.height
      }
      setLoaded(true)
      renderPreview(DEFAULT_TOLERANCE)
    }
    img.onerror = () => {
      if (!cancelled) setError('ribbonImageLoadFail')
    }
    img.src = dataUrl
    return () => {
      cancelled = true
    }
  }, [dataUrl, renderPreview])

  const onTolerance = (v: number) => {
    setTolerance(v)
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      renderPreview(v)
    })
  }
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const apply = () => {
    const full = fullRef.current
    if (!full || applying) return
    setApplying(true)
    // let the "processing…" state render before the heavy recompute
    window.setTimeout(() => {
      try {
        const result = removeBackground(full, tolerance, bgColorsRef.current)
        const c = document.createElement('canvas')
        c.width = full.width
        c.height = full.height
        c.getContext('2d')!.putImageData(new ImageData(result.data, full.width, full.height), 0, 0)
        onApply(c.toDataURL('image/png'))
      } catch {
        setApplying(false)
        setError('ribbonImageProcessFail')
      }
    }, 30)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: PREVIEW_MAX + 48 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t('ribbonRemoveBg')}</h2>
        <div
          style={{
            ...CHECKERBOARD,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 160,
            maxHeight: PREVIEW_MAX,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {error ? (
            <span
              style={{
                color: 'var(--danger)',
                background: 'var(--surface)',
                padding: '4px 10px',
                borderRadius: 4,
              }}
            >
              {t(error)}
            </span>
          ) : (
            <canvas
              ref={canvasRef}
              style={{
                maxWidth: '100%',
                maxHeight: PREVIEW_MAX,
                display: loaded ? 'block' : 'none',
              }}
            />
          )}
          {!loaded && !error && (
            <span style={{ color: 'var(--text-muted)' }}>{t('ribbonLoading')}</span>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ whiteSpace: 'nowrap' }}>{t('ribbonCutoutTolerance')}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={tolerance}
            disabled={!loaded || applying}
            onChange={(e) => onTolerance(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 32, textAlign: 'right' }}>{tolerance}</span>
        </label>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {t('ribbonCutoutHint', { pct: removedPct })}
        </div>
        <div className="modal-actions">
          <button onClick={onCancel} disabled={applying}>
            {t('ribbonCancel')}
          </button>
          <button className="primary" onClick={apply} disabled={!loaded || !!error || applying}>
            {applying ? t('ribbonProcessing') : t('ribbonApply')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= Crop ================= */

/** Crop region (0..1 ratios, relative to the whole image) */
interface CropRect {
  l: number
  t: number
  r: number
  b: number
}

type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

/** Minimum crop-box side (preview px), prevents dragging to 0 */
const MIN_CROP_PX = 16

interface CropProps {
  dataUrl: string
  /** Apply: the cropped dataUrl (png/jpeg follows the original format) */
  onApply: (croppedDataUrl: string) => void
  onCancel: () => void
}

export function CropDialog({ dataUrl, onApply, onCancel }: CropProps) {
  const { t } = useI18n()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<StringKey | null>(null)
  const [crop, setCrop] = useState<CropRect>({ l: 0, t: 0, r: 1, b: 1 })
  /** Preview display size (CSS px) */
  const [view, setView] = useState<{ w: number; h: number } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    handle: CropHandle
    startX: number
    startY: number
    start: CropRect
  } | null>(null)

  const updateView = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const maxWidth = Math.max(80, Math.min(PREVIEW_MAX, window.innerWidth - 92))
    const maxHeight = Math.max(80, Math.min(PREVIEW_MAX, window.innerHeight - 220))
    setView(fitCropPreview(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight))
  }, [])

  useEffect(() => {
    document.body.classList.add('docs-crop-active')
    return () => document.body.classList.remove('docs-crop-active')
  }, [])

  useEffect(() => {
    window.addEventListener('resize', updateView)
    return () => window.removeEventListener('resize', updateView)
  }, [updateView])

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      if (!img.naturalWidth || !img.naturalHeight) {
        setError('ribbonImageLoadFail')
        return
      }
      imgRef.current = img
      updateView()
      setLoaded(true)
    }
    img.onerror = () => {
      if (!cancelled) setError('ribbonImageLoadFail')
    }
    img.src = dataUrl
    return () => {
      cancelled = true
    }
  }, [dataUrl, updateView])

  const apply = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    const sx = Math.round(crop.l * w)
    const sy = Math.round(crop.t * h)
    const sw = Math.max(1, Math.round((crop.r - crop.l) * w))
    const sh = Math.max(1, Math.round((crop.b - crop.t) * h))
    try {
      const c = document.createElement('canvas')
      c.width = sw
      c.height = sh
      c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      // jpeg has no alpha channel; keep jpeg to avoid size bloat. Others (png/gif) all output png to preserve transparency
      const isJpeg = /^data:image\/jpeg/.test(dataUrl)
      onApply(isJpeg ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png'))
    } catch {
      setError('ribbonImageProcessFail')
    }
  }, [crop, dataUrl, onApply])

  // Esc cancels / Enter applies
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter' && loaded && !error) {
        e.preventDefault()
        apply()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, apply, loaded, error])

  const startDrag = (handle: CropHandle) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, start: crop }
  }

  useEffect(() => {
    if (!view) return
    const minW = MIN_CROP_PX / view.w
    const minH = MIN_CROP_PX / view.h
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (e.clientX - drag.startX) / view.w
      const dy = (e.clientY - drag.startY) / view.h
      const s = drag.start
      let { l, t, r, b } = s
      if (drag.handle === 'move') {
        const w = s.r - s.l
        const h = s.b - s.t
        l = Math.min(Math.max(0, s.l + dx), 1 - w)
        t = Math.min(Math.max(0, s.t + dy), 1 - h)
        r = l + w
        b = t + h
      } else {
        if (drag.handle.includes('w')) l = Math.min(Math.max(0, s.l + dx), s.r - minW)
        if (drag.handle.includes('e')) r = Math.max(Math.min(1, s.r + dx), s.l + minW)
        if (drag.handle.includes('n')) t = Math.min(Math.max(0, s.t + dy), s.b - minH)
        if (drag.handle.includes('s')) b = Math.max(Math.min(1, s.b + dy), s.t + minH)
      }
      setCrop({ l, t, r, b })
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [view])

  /** Shared handle style */
  const handleStyle = (pos: CropHandle): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 10,
      height: 10,
      background: '#fff',
      border: '1.5px solid #2b5797',
      borderRadius: 2,
      boxSizing: 'border-box',
      zIndex: 2,
    }
    const cursors: Record<string, string> = {
      nw: 'nwse-resize',
      se: 'nwse-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
    }
    base.cursor = cursors[pos]
    if (pos.includes('n')) base.top = -5
    if (pos.includes('s')) base.bottom = -5
    if (pos.includes('w')) base.left = -5
    if (pos.includes('e')) base.right = -5
    if (pos === 'n' || pos === 's') {
      base.left = '50%'
      base.marginLeft = -5
    }
    if (pos === 'e' || pos === 'w') {
      base.top = '50%'
      base.marginTop = -5
    }
    return base
  }

  const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal crop-modal"
        style={{
          width: PREVIEW_MAX + 48 + CROP_HANDLE_GUTTER * 2,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t('ribbonCrop')}</h2>
        <div
          style={{
            ...CHECKERBOARD,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 160,
            borderRadius: 4,
            padding: CROP_HANDLE_GUTTER,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {error ? (
            <span
              style={{
                color: 'var(--danger)',
                background: 'var(--surface)',
                padding: '4px 10px',
                borderRadius: 4,
              }}
            >
              {t(error)}
            </span>
          ) : loaded && view ? (
            <div
              ref={boxRef}
              style={{ position: 'relative', width: view.w, height: view.h, userSelect: 'none' }}
            >
              <img
                src={dataUrl}
                width={view.w}
                height={view.h}
                draggable={false}
                style={{ display: 'block' }}
              />
              {/* the four masks outside the crop box */}
              {(() => {
                const px = (v: number, total: number) => Math.round(v * total)
                const dim: React.CSSProperties = {
                  position: 'absolute',
                  background: 'rgba(0,0,0,0.45)',
                }
                return (
                  <>
                    <div
                      style={{ ...dim, left: 0, top: 0, width: '100%', height: px(crop.t, view.h) }}
                    />
                    <div
                      style={{
                        ...dim,
                        left: 0,
                        bottom: 0,
                        width: '100%',
                        height: view.h - px(crop.b, view.h),
                      }}
                    />
                    <div
                      style={{
                        ...dim,
                        left: 0,
                        top: px(crop.t, view.h),
                        width: px(crop.l, view.w),
                        height: px(crop.b, view.h) - px(crop.t, view.h),
                      }}
                    />
                    <div
                      style={{
                        ...dim,
                        right: 0,
                        top: px(crop.t, view.h),
                        width: view.w - px(crop.r, view.w),
                        height: px(crop.b, view.h) - px(crop.t, view.h),
                      }}
                    />
                  </>
                )
              })()}
              {/* crop box + handles */}
              <div
                style={{
                  position: 'absolute',
                  left: `${crop.l * 100}%`,
                  top: `${crop.t * 100}%`,
                  width: `${(crop.r - crop.l) * 100}%`,
                  height: `${(crop.b - crop.t) * 100}%`,
                  border: '1.5px solid #2b5797',
                  boxSizing: 'border-box',
                  cursor: 'move',
                }}
                onMouseDown={startDrag('move')}
              >
                {HANDLES.map((pos) => (
                  <div key={pos} style={handleStyle(pos)} onMouseDown={startDrag(pos)} />
                ))}
              </div>
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>{t('ribbonLoading')}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          {t('ribbonCropHint')}
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>{t('ribbonCancel')}</button>
          <button className="primary" onClick={apply} disabled={!loaded || !!error}>
            {t('ribbonApply')}
          </button>
        </div>
      </div>
    </div>
  )
}
