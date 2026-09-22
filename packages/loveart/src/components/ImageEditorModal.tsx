import { useEffect, useRef, useState } from 'react'
import { useCanvas } from '../store/canvasStore'
import { useEditor } from '../store/editorStore'
import { blobForCard, editCard } from '../services/edits'
import { useT } from '../i18n'
import { useSettings } from '../store/settingsStore'
import { photoEnhancements, photoEnhancementPrompt } from '../data/photoEnhancements'

type Mode = 'region' | 'whole' | 'photo'

export default function ImageEditorModal() {
  const cardId = useEditor((s) => s.cardId)
  return cardId ? <ImageEditor key={cardId} /> : null
}

function ImageEditor() {
  const cardId = useEditor((s) => s.cardId)
  const close = useEditor((s) => s.close)
  const card = useCanvas((s) => s.cards.find((c) => c.id === cardId))
  const t = useT()
  const lang = useSettings((s) => s.lang)

  const [imgUrl, setImgUrl] = useState<string | undefined>()
  const [mode, setMode] = useState<Mode>('region')
  const [brush, setBrush] = useState(28)
  const [erase, setErase] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasMask, setHasMask] = useState(false)
  const [presetId, setPresetId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const paintRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Load the source image blob → object URL.
  useEffect(() => {
    if (!card) return
    let url: string | undefined
    let cancelled = false
    blobForCard(card)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setImgUrl(url)
      })
      .catch(() => {
        if (!cancelled) setError(t('imageLoadFailed'))
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [card])

  if (!card || card.type !== 'image') return null

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const canvas = paintRef.current
    if (!canvas) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
  }

  const toCanvasPoint = (e: React.PointerEvent) => {
    const canvas = paintRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
      scale: canvas.width / rect.width,
    }
  }

  const stroke = (
    from: { x: number; y: number } | null,
    to: { x: number; y: number },
    scale: number,
  ) => {
    const ctx = paintRef.current!.getContext('2d')!
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = 'rgba(124,92,255,1)'
    ctx.fillStyle = 'rgba(124,92,255,1)'
    ctx.lineWidth = brush * scale
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (from) {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(to.x, to.y, (brush * scale) / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    setHasMask(true)
  }

  const onDown = (e: React.PointerEvent) => {
    if (mode !== 'region') return
    e.preventDefault()
    paintRef.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = toCanvasPoint(e)
    stroke(null, p, p.scale)
    last.current = { x: p.x, y: p.y }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const p = toCanvasPoint(e)
    stroke(last.current, p, p.scale)
    last.current = { x: p.x, y: p.y }
  }
  const onUp = () => {
    drawing.current = false
    last.current = null
  }

  const clearMask = () => {
    const c = paintRef.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setHasMask(false)
  }

  // Build an OpenAI-style mask: opaque (kept) everywhere, transparent where painted (editable).
  const buildMask = (): Promise<Blob> => {
    const paint = paintRef.current!
    const mask = document.createElement('canvas')
    mask.width = paint.width
    mask.height = paint.height
    const ctx = mask.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, mask.width, mask.height)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(paint, 0, 0)
    return new Promise((resolve) => mask.toBlob((b) => resolve(b!), 'image/png'))
  }

  const apply = async () => {
    if (!prompt.trim() || busy || !imgUrl) return
    setBusy(true)
    setError('')
    try {
      const mask = mode === 'region' && hasMask ? await buildMask() : undefined
      await editCard(card.projectId, card, prompt, mask)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 13,
    background: active ? 'var(--accent-grad)' : 'var(--bg-elevated)',
    color: active ? '#fff' : 'var(--text-primary)',
    border: '1px solid var(--border)',
  })

  return (
    <div
      onClick={() => {
        if (!busy) close()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('editImage')}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-popover)',
          padding: 20,
          width: 'min(720px, 92vw)',
          maxHeight: '92vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{t('editImage')}</h3>
          <button className="muted" disabled={busy} aria-label={t('cancel')} onClick={close}>
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              aria-pressed={mode === 'region'}
              style={tabBtn(mode === 'region')}
              onClick={() => setMode('region')}
            >
              {t('retouchRegion')}
            </button>
            <button
              aria-pressed={mode === 'whole'}
              style={tabBtn(mode === 'whole')}
              onClick={() => setMode('whole')}
            >
              {t('editWhole')}
            </button>
            <button
              aria-pressed={mode === 'photo'}
              style={tabBtn(mode === 'photo')}
              onClick={() => setMode('photo')}
            >
              {t('photoEnhance')}
            </button>
          </div>

          {mode === 'photo' && (
            <section aria-label={t('photoEnhance')} style={{ marginBottom: 16 }}>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                {t('photoEnhanceHint')}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 8,
                }}
              >
                {photoEnhancements.map((preset) => (
                  <button
                    key={preset.id}
                    aria-pressed={presetId === preset.id}
                    onClick={() => {
                      setPresetId(preset.id)
                      setPrompt(photoEnhancementPrompt(preset, lang))
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: 12,
                      border: `1px solid ${presetId === preset.id ? 'var(--accent)' : 'var(--border)'}`,
                      background:
                        presetId === preset.id ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ display: 'block', fontWeight: 600, marginBottom: 5 }}>
                      <span aria-hidden="true">{preset.icon} </span>
                      {preset[lang].name}
                    </span>
                    <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      {preset[lang].goal}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Image + paint overlay */}
          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              maxWidth: '100%',
              lineHeight: 0,
            }}
          >
            {imgUrl && (
              <img
                src={imgUrl}
                onLoad={onImgLoad}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '52vh', display: 'block', borderRadius: 8 }}
              />
            )}
            <canvas
              ref={paintRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: mode === 'region' ? 0.5 : 0,
                pointerEvents: mode === 'region' && !busy ? 'auto' : 'none',
                cursor: mode === 'region' ? 'crosshair' : 'default',
                borderRadius: 8,
                touchAction: 'none',
              }}
            />
          </div>

          {/* Brush controls (region mode) */}
          {mode === 'region' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 12,
                flexWrap: 'wrap',
              }}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                {t('paintHint')}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                {t('brushSize')}
                <input
                  type="range"
                  min={6}
                  max={80}
                  value={brush}
                  onChange={(e) => setBrush(Number(e.target.value))}
                />
              </label>
              <button style={tabBtn(erase)} onClick={() => setErase((v) => !v)}>
                {t('eraser')}
              </button>
              <button className="btn-ghost" onClick={clearMask}>
                {t('clearMask')}
              </button>
            </div>
          )}

          {/* Prompt + apply */}
          <div style={{ marginTop: 14 }}>
            <label
              htmlFor="image-edit-prompt"
              style={{ display: 'block', fontSize: 13, marginBottom: 8 }}
            >
              {t('editInstructions')}
            </label>
            <textarea
              id="image-edit-prompt"
              rows={mode === 'photo' ? 5 : 3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('editPromptPlaceholder')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />
            {error && (
              <p role="alert" style={{ color: 'var(--danger, #dc4646)', fontSize: 13 }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn-ghost" onClick={close}>
                {t('cancel')}
              </button>
              <button
                className="btn-accent"
                onClick={apply}
                disabled={busy || !prompt.trim() || !imgUrl}
              >
                {busy ? t('applying') : t('apply')}
              </button>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  )
}
