import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../store/settingsStore'

type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; width: number }

export default function SketchPad({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (blob: Blob) => void
}) {
  const zh = useSettings((s) => s.lang === 'zh')
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const active = useRef<Stroke | null>(null)
  const pointer = useRef<number | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redo, setRedo] = useState<Stroke[]>([])
  const [color, setColor] = useState('#222222')
  const [width, setWidth] = useState(8)
  const [eraser, setEraser] = useState(false)
  const [ratio, setRatio] = useState('16:9')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rw, rh] = ratio.split(':').map(Number)
  const w = rw >= rh ? 1024 : Math.round((1024 * rw) / rh)
  const h = rh >= rw ? 1024 : Math.round((1024 * rh) / rw)
  const draw = (stroke: Stroke) => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !stroke.points.length) return
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const [first, ...rest] = stroke.points
    ctx.beginPath()
    ctx.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    rest.forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }
  const repaint = () => {
    if (!open) return
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    strokes.forEach(draw)
  }
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  useEffect(repaint, [strokes, ratio, open])
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(w, ((e.clientX - r.left) * w) / r.width)),
      y: Math.max(0, Math.min(h, ((e.clientY - r.top) * h) / r.height)),
    }
  }
  const finish = () => {
    const completed = active.current
    if (completed) {
      setStrokes((s) => [...s, completed])
      setRedo([])
    }
    active.current = null
    pointer.current = null
  }
  const save = async () => {
    if (!strokes.some((s) => s.color !== '#ffffff') || saving) return
    setSaving(true)
    setError('')
    try {
      if (!canvas.current) throw new Error('Canvas unavailable')
      const element = canvas.current
      const blob = await new Promise<Blob>((resolve, reject) =>
        element.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('PNG export failed'))),
          'image/png',
        ),
      )
      onAdd(blob)
      onClose()
    } catch {
      setError(zh ? '草图导出失败，请重试' : 'Could not export sketch. Try again.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-label={zh ? 'Sketch 手绘板' : 'Sketch pad'}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      style={{
        width: 'min(900px, 94vw)',
        maxHeight: '92vh',
        overflow: 'auto',
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 20,
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Sketch · {zh ? '手绘板' : 'Drawing board'}</h2>
        <button
          onClick={onClose}
          disabled={saving}
          aria-label={zh ? '关闭手绘板' : 'Close sketch pad'}
        >
          ✕
        </button>
      </div>
      <p className="muted">
        {zh
          ? '画出主体位置和构图，完成后作为参考图使用。支持鼠标、触屏和手写笔。'
          : 'Sketch the composition and subject placement, then add it as a reference. Mouse, touch and pen supported.'}
      </p>
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <button className="chip" aria-pressed={!eraser} onClick={() => setEraser(false)}>
          {zh ? '画笔' : 'Pen'}
        </button>
        <button className="chip" aria-pressed={eraser} onClick={() => setEraser(true)}>
          {zh ? '橡皮擦' : 'Eraser'}
        </button>
        <input
          type="color"
          aria-label={zh ? '画笔颜色' : 'Pen color'}
          value={color}
          onChange={(e) => {
            setColor(e.target.value)
            setEraser(false)
          }}
        />
        <label>
          {zh ? '粗细' : 'Width'}{' '}
          <input
            type="range"
            aria-label={zh ? '画笔粗细' : 'Pen width'}
            min={2}
            max={40}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <select
          aria-label={zh ? '草图比例' : 'Sketch aspect ratio'}
          value={ratio}
          disabled={strokes.length > 0}
          onChange={(e) => {
            setRatio(e.target.value)
            setRedo([])
          }}
        >
          {['16:9', '1:1', '9:16'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button
          className="chip"
          disabled={!strokes.length}
          onClick={() => {
            setRedo((r) => [...r, strokes[strokes.length - 1]])
            setStrokes(strokes.slice(0, -1))
          }}
        >
          {zh ? '撤销' : 'Undo'}
        </button>
        <button
          className="chip"
          disabled={!redo.length}
          onClick={() => {
            setStrokes((s) => [...s, redo[redo.length - 1]])
            setRedo(redo.slice(0, -1))
          }}
        >
          {zh ? '重做' : 'Redo'}
        </button>
        <button
          className="chip"
          disabled={!strokes.length}
          onClick={() => {
            setStrokes([])
            setRedo([])
          }}
        >
          {zh ? '清空' : 'Clear'}
        </button>
      </div>
      <canvas
        ref={canvas}
        width={w}
        height={h}
        aria-label={zh ? '草图绘图区' : 'Sketch drawing area'}
        style={{
          display: 'block',
          width: `min(100%, ${(55 * rw) / rh}vh)`,
          height: 'auto',
          margin: '0 auto',
          aspectRatio: ratio.replace(':', '/'),
          background: '#fff',
          touchAction: 'none',
          cursor: 'crosshair',
          borderRadius: 8,
        }}
        onPointerDown={(e) => {
          if (pointer.current !== null || e.button !== 0 || saving) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          pointer.current = e.pointerId
          active.current = {
            color: eraser ? '#ffffff' : color,
            width: eraser ? width * 3 : width,
            points: [point(e)],
          }
          draw(active.current)
        }}
        onPointerMove={(e) => {
          if (active.current && pointer.current === e.pointerId) {
            active.current.points.push(point(e))
            draw(active.current)
          }
        }}
        onPointerUp={(e) => {
          if (pointer.current === e.pointerId) finish()
        }}
        onLostPointerCapture={(e) => {
          if (pointer.current === e.pointerId) finish()
        }}
        onPointerCancel={(e) => {
          if (pointer.current === e.pointerId) {
            active.current = null
            pointer.current = null
            repaint()
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          className="btn-accent"
          disabled={saving || !strokes.some((s) => s.color !== '#ffffff')}
          onClick={save}
        >
          {zh ? '用作参考图' : 'Use as reference'}
        </button>
      </div>
    </dialog>
  )
}
