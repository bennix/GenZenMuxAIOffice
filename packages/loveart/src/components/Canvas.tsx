import { useEffect, useRef, useState } from 'react'
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch'
import { useCanvas } from '../store/canvasStore'
import { useSelection } from '../store/selectionStore'
import AssetCard from './AssetCard'
import CanvasEdges, { type TempBranchEdge } from './CanvasEdges'
import { useT } from '../i18n'
import type { Card } from '../types'

interface Transform {
  x: number
  y: number
  scale: number
}
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

function Toolbar({
  scale,
  selectMode,
  onToggleSelect,
}: {
  scale: number
  selectMode: boolean
  onToggleSelect: () => void
}) {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: '6px 10px',
        boxShadow: 'var(--shadow-popover)',
        zIndex: 10,
      }}
    >
      <button
        onClick={onToggleSelect}
        title="Select (marquee)"
        style={{
          fontSize: 14,
          padding: '2px 8px',
          borderRadius: 'var(--radius-pill)',
          background: selectMode ? 'var(--accent-grad)' : 'transparent',
          color: selectMode ? '#fff' : 'var(--text-muted)',
        }}
      >
        ▭
      </button>
      <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
      <button className="muted" onClick={() => zoomOut()} title="Zoom out">
        −
      </button>
      <span className="muted" style={{ fontSize: 13, minWidth: 40, textAlign: 'center' }}>
        {Math.round(scale * 100)}%
      </span>
      <button className="muted" onClick={() => zoomIn()} title="Zoom in">
        ＋
      </button>
      <button className="muted" onClick={() => resetTransform()} title="Reset">
        ⤢
      </button>
    </div>
  )
}

export default function Canvas({ projectId }: { projectId: string }) {
  const cards = useCanvas((s) => s.cards.filter((c) => c.projectId === projectId))
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [selectMode, setSelectMode] = useState(false)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [branchDrag, setBranchDrag] = useState<TempBranchEdge | null>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const setSelection = useSelection((s) => s.set)
  const clearSelection = useSelection((s) => s.clear)
  const selectedIds = useSelection((s) => s.ids)
  const selectedCount = cards.filter((card) => selectedIds.includes(card.id)).length
  const createBranchDraft = useCanvas((s) => s.createBranchDraft)
  const t = useT()

  useEffect(() => {
    clearSelection()
  }, [clearSelection, projectId])

  const pointerClientPoint = (e: React.PointerEvent) => {
    const x = Number.isFinite(e.clientX) ? e.clientX : 0
    const y = Number.isFinite(e.clientY) ? e.clientY : 0
    return { x, y }
  }
  const localPoint = (e: React.PointerEvent) => {
    const r = outerRef.current!.getBoundingClientRect()
    const p = pointerClientPoint(e)
    return { x: p.x - r.left, y: p.y - r.top }
  }
  const canvasPoint = (e: React.PointerEvent) => {
    const p = localPoint(e)
    return {
      x: (p.x - transform.x) / transform.scale,
      y: (p.y - transform.y) / transform.scale,
    }
  }
  const capturePointer = (el: HTMLElement | null, pointerId: number) => {
    try {
      el?.setPointerCapture?.(pointerId)
    } catch {
      // jsdom and some browsers can reject pointer capture for synthetic events.
    }
  }

  const onBranchStart = (card: Card, e: React.PointerEvent) => {
    const p = canvasPoint(e)
    capturePointer(outerRef.current, e.pointerId)
    setBranchDrag({
      sourceCardId: card.id,
      sourceAnchor: 'right',
      targetX: p.x,
      targetY: p.y,
    })
  }

  const onDown = (e: React.PointerEvent) => {
    if (!selectMode) return
    capturePointer(e.target as HTMLElement, e.pointerId)
    const p = localPoint(e)
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMove = (e: React.PointerEvent) => {
    if (branchDrag) {
      const p = canvasPoint(e)
      setBranchDrag((edge) => (edge ? { ...edge, targetX: p.x, targetY: p.y } : edge))
      return
    }
    if (!selectMode || !marquee) return
    const p = localPoint(e)
    setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m))
  }
  const onUp = () => {
    if (branchDrag) {
      createBranchDraft(branchDrag.sourceCardId, { x: branchDrag.targetX, y: branchDrag.targetY })
      setBranchDrag(null)
      return
    }
    if (!marquee) return
    const minX = Math.min(marquee.x0, marquee.x1),
      maxX = Math.max(marquee.x0, marquee.x1)
    const minY = Math.min(marquee.y0, marquee.y1),
      maxY = Math.max(marquee.y0, marquee.y1)
    setMarquee(null)
    // A tiny rect is a click → clear selection.
    if (maxX - minX < 6 && maxY - minY < 6) {
      clearSelection()
      return
    }
    // Card canvas-rect → screen-rect: screen = position + canvas*scale.
    const { x, y, scale } = transform
    const hit = cards
      .filter((c) => {
        const sx = x + c.x * scale,
          sy = y + c.y * scale,
          sw = c.w * scale,
          sh = c.h * scale
        return !(sx + sw < minX || sx > maxX || sy + sh < minY || sy > maxY)
      })
      .map((c) => c.id)
    setSelection(hit)
  }

  return (
    <div
      ref={outerRef}
      data-testid="canvas-root"
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
        background:
          'radial-gradient(circle, var(--dot) 1px, transparent 1px) 0 0 / 24px 24px, var(--bg-base)',
      }}
    >
      <TransformWrapper
        minScale={0.2}
        maxScale={3}
        limitToBounds={false}
        panning={{ excluded: ['asset-card', 'branch-editor'], disabled: selectMode }}
        doubleClick={{ disabled: true }}
        onTransformed={(_, state) =>
          setTransform({ x: state.positionX, y: state.positionY, scale: state.scale })
        }
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%' }}
        >
          <div style={{ position: 'relative', width: 4000, height: 4000 }}>
            <CanvasEdges projectId={projectId} tempEdge={branchDrag} />
            {cards.map((c) => (
              <div
                key={c.id}
                className="asset-card"
                style={{ position: 'absolute', left: 0, top: 0 }}
              >
                <AssetCard card={c} scale={transform.scale} onBranchStart={onBranchStart} />
              </div>
            ))}
          </div>
        </TransformComponent>
        <Toolbar
          scale={transform.scale}
          selectMode={selectMode}
          onToggleSelect={() => {
            setSelectMode((v) => !v)
            clearSelection()
          }}
        />
      </TransformWrapper>

      {/* Marquee capture overlay (select mode only) */}
      {selectMode && (
        <div
          onPointerDown={onDown}
          style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'crosshair' }}
        >
          {marquee && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
                background: 'rgba(124,92,255,0.15)',
                border: '1px solid var(--accent)',
                borderRadius: 4,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      )}

      {/* Selected count badge */}
      {selectedCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-pill)',
            padding: '6px 12px',
            fontSize: 13,
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          {selectedCount} {t('selected')}
          <button className="muted" onClick={clearSelection} title="Clear">
            ✕
          </button>
        </div>
      )}

      {cards.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span className="muted">{t('canvasEmpty')}</span>
        </div>
      )}
    </div>
  )
}
