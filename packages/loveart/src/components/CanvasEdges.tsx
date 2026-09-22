import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'
import { useT } from '../i18n'
import { runBranchGeneration } from '../services/branchGeneration'
import HumanScenePicker from './HumanScenePicker'
import ReferenceTray, { makeRef, type Ref } from './ReferenceTray'
import SketchPad from './SketchPad'
import VideoDurationSelect from './VideoDurationSelect'
import { normalizeVideoOptions, videoCapabilities } from '../services/videoModels'
import type { BranchOutputMode, CanvasEdge, Card } from '../types'

export type TempBranchEdge = Pick<
  CanvasEdge,
  'sourceCardId' | 'sourceAnchor' | 'targetX' | 'targetY'
>

interface Point {
  x: number
  y: number
}

function sourcePoint(card: Card, anchor: CanvasEdge['sourceAnchor']): Point {
  if (anchor === 'bottom') {
    return { x: card.x + card.w / 2, y: card.y + card.h }
  }
  return { x: card.x + card.w, y: card.y + card.h / 2 }
}

function targetPoint(edge: CanvasEdge | TempBranchEdge, target?: Card): Point {
  if (!target) return { x: edge.targetX, y: edge.targetY }
  return { x: target.x, y: target.y + target.h / 2 }
}

function pathFor(start: Point, end: Point): string {
  const bend = Math.max(80, Math.abs(end.x - start.x) / 2)
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`
}

function midpoint(start: Point, end: Point): Point {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
}

export default function CanvasEdges({
  projectId,
  tempEdge,
}: {
  projectId: string
  tempEdge?: TempBranchEdge | null
}) {
  const cards = useCanvas((s) => s.cards.filter((card) => card.projectId === projectId))
  const edges = useCanvas((s) => (s.edges ?? []).filter((edge) => edge.projectId === projectId))
  const addCard = useCanvas((s) => s.addCard)
  const updateEdge = useCanvas((s) => s.updateEdge)
  const removeEdge = useCanvas((s) => s.removeEdge)
  const attachEdgeTarget = useCanvas((s) => s.attachEdgeTarget)
  const models = useSettings((s) => s.models)
  const defaultModel = useSettings((s) => s.defaultModel)
  const t = useT()
  const zh = useSettings((s) => s.lang === 'zh')
  const generatingEdges = useRef<Set<string>>(new Set())
  const [attachments, setAttachments] = useState<Record<string, Ref[]>>({})
  const attachmentCache = useRef(attachments)
  attachmentCache.current = attachments
  const [sketchEdgeId, setSketchEdgeId] = useState<string | null>(null)
  useEffect(
    () => () => {
      Object.values(attachmentCache.current)
        .flat()
        .forEach((ref) => URL.revokeObjectURL(ref.url))
    },
    [],
  )
  useEffect(() => {
    const obsolete = Object.keys(attachmentCache.current).filter(
      (id) => !edges.some((edge) => edge.id === id && edge.status !== 'ready'),
    )
    if (!obsolete.length) return
    setAttachments((current) => {
      const next = { ...current }
      obsolete.forEach((id) => {
        next[id]?.forEach((ref) => URL.revokeObjectURL(ref.url))
        delete next[id]
      })
      return next
    })
  }, [edges])
  const addRefs = (edgeId: string, blobs: Blob[], kind?: 'sketch') => {
    const added = blobs.map((blob) => ({ ...makeRef(blob), kind }))
    setAttachments((current) => ({ ...current, [edgeId]: [...(current[edgeId] ?? []), ...added] }))
  }

  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])

  const renderableEdges = edges
    .map((edge) => {
      const source = cardsById.get(edge.sourceCardId)
      if (!source) return undefined
      const target = edge.targetCardId ? cardsById.get(edge.targetCardId) : undefined
      const start = sourcePoint(source, edge.sourceAnchor)
      const end = targetPoint(edge, target)
      return { edge, start, end, mid: midpoint(start, end), path: pathFor(start, end) }
    })
    .filter(Boolean) as Array<{
    edge: CanvasEdge
    start: Point
    end: Point
    mid: Point
    path: string
  }>

  const temp = (() => {
    if (!tempEdge) return undefined
    const source = cardsById.get(tempEdge.sourceCardId)
    if (!source) return undefined
    const start = sourcePoint(source, tempEdge.sourceAnchor)
    const end = targetPoint(tempEdge)
    return { start, end, path: pathFor(start, end) }
  })()

  const setOutputMode = (edge: CanvasEdge, outputMode: BranchOutputMode) => {
    updateEdge(edge.id, {
      outputMode,
      model: defaultModel(outputMode)?.id,
      ...(outputMode === 'image' ? { humanSceneId: null, useHumanSceneReference: false } : {}),
    })
  }

  const generate = (edge: CanvasEdge) => {
    if (!['draft', 'failed'].includes(edge.status) || generatingEdges.current.has(edge.id)) {
      return
    }

    generatingEdges.current.add(edge.id)
    const isVideo = edge.outputMode === 'video'
    const selectedModel = edge.model ?? defaultModel(edge.outputMode)?.id
    const existingTarget = edge.targetCardId ? cardsById.get(edge.targetCardId) : undefined
    const targetCardId =
      existingTarget?.projectId === projectId
        ? existingTarget.id
        : addCard({
            projectId,
            type: edge.outputMode,
            status: 'generating',
            model: selectedModel,
            prompt: edge.prompt,
            x: edge.targetX,
            y: edge.targetY,
            w: isVideo ? 400 : 320,
            h: isVideo ? 240 : 320,
          })

    attachEdgeTarget(edge.id, targetCardId)
    updateEdge(edge.id, { targetCardId, status: 'generating' })
    if (existingTarget?.projectId === projectId) {
      useCanvas.getState().updateCard(targetCardId, {
        type: edge.outputMode,
        status: 'generating',
        model: selectedModel,
        prompt: edge.prompt,
        error: undefined,
        x: edge.targetX,
        y: edge.targetY,
        w: isVideo ? 400 : 320,
        h: isVideo ? 240 : 320,
      })
    }
    const refs = attachments[edge.id]
    const generation = refs?.length
      ? runBranchGeneration(projectId, edge.id, refs)
      : runBranchGeneration(projectId, edge.id)
    void generation.finally(() => {
      generatingEdges.current.delete(edge.id)
    })
  }

  return (
    <>
      <svg
        width={4000}
        height={4000}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {renderableEdges.map(({ edge, path }) => (
          <path
            key={edge.id}
            d={path}
            fill="none"
            stroke={edge.status === 'failed' ? 'var(--danger)' : 'var(--accent)'}
            strokeWidth={2}
            strokeDasharray={edge.status === 'draft' ? '8 6' : undefined}
            opacity={edge.status === 'generating' ? 0.6 : 0.9}
          />
        ))}
        {temp && (
          <path
            d={temp.path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="6 6"
            opacity={0.7}
          />
        )}
      </svg>

      {renderableEdges
        .filter(({ edge }) => edge.status === 'draft' || edge.status === 'failed')
        .map(({ edge, mid }) => (
          <div
            key={`${edge.id}-editor`}
            className="branch-editor"
            onPaste={(e) => {
              const images = Array.from(e.clipboardData.items)
                .filter((item) => item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file))
              if (images.length) {
                e.preventDefault()
                e.stopPropagation()
                addRefs(edge.id, images)
              }
            }}
            style={{
              position: 'absolute',
              left: mid.x,
              top: mid.y,
              width: edge.outputMode === 'video' ? 760 : 320,
              maxWidth: 'calc(100vw - 48px)',
              transform: 'translate(-50%, -50%)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-popover)',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              zIndex: 3,
            }}
          >
            <textarea
              aria-label={t('branchPromptPlaceholder')}
              placeholder={t('branchPromptPlaceholder')}
              value={edge.prompt}
              onChange={(e) => updateEdge(edge.id, { prompt: e.target.value })}
              style={{
                resize: 'vertical',
                minHeight: 64,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-input)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: 8,
                font: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                aria-pressed={edge.outputMode === 'image'}
                onClick={() => setOutputMode(edge, 'image')}
                className={edge.outputMode === 'image' ? undefined : 'muted'}
                style={{
                  flex: 1,
                  borderRadius: 'var(--radius-pill)',
                  background: edge.outputMode === 'image' ? 'var(--accent-grad)' : 'transparent',
                  color: edge.outputMode === 'image' ? '#fff' : undefined,
                }}
              >
                {t('branchImage')}
              </button>
              <button
                type="button"
                aria-pressed={edge.outputMode === 'video'}
                onClick={() => setOutputMode(edge, 'video')}
                className={edge.outputMode === 'video' ? undefined : 'muted'}
                style={{
                  flex: 1,
                  borderRadius: 'var(--radius-pill)',
                  background: edge.outputMode === 'video' ? 'var(--accent-grad)' : 'transparent',
                  color: edge.outputMode === 'video' ? '#fff' : undefined,
                }}
              >
                {t('branchVideo')}
              </button>
            </div>
            <select
              value={edge.model ?? defaultModel(edge.outputMode)?.id ?? ''}
              onChange={(e) => updateEdge(edge.id, { model: e.target.value })}
              title={`${edge.outputMode} model`}
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-input)',
                padding: '6px 8px',
                fontSize: 12,
              }}
            >
              {models
                .filter((model) => model.category === edge.outputMode)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
            </select>
            {edge.outputMode === 'video' && (
              <VideoDurationSelect
                durations={
                  videoCapabilities(edge.model ?? defaultModel('video')?.id ?? '').durations
                }
                value={
                  normalizeVideoOptions(edge.model ?? defaultModel('video')?.id ?? '', {
                    duration: edge.duration,
                  }).duration
                }
                onChange={(duration) => updateEdge(edge.id, { duration })}
              />
            )}
            {edge.outputMode === 'video' ? (
              <HumanScenePicker
                projectId={projectId}
                aspect="16:9"
                value={edge.humanSceneId ?? null}
                useReference={Boolean(edge.useHumanSceneReference)}
                onChange={(humanSceneId) => updateEdge(edge.id, { humanSceneId })}
                onUseReferenceChange={(useHumanSceneReference) =>
                  updateEdge(edge.id, { useHumanSceneReference })
                }
              />
            ) : null}
            <label
              className="muted"
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}
            >
              <input
                type="checkbox"
                checked={edge.useSourceAsReference}
                onChange={(e) => updateEdge(edge.id, { useSourceAsReference: e.target.checked })}
              />
              {t('branchUseReference')}
            </label>
            <ReferenceTray
              refs={attachments[edge.id] ?? []}
              onAdd={(blobs) => addRefs(edge.id, blobs)}
              onRemove={(id) =>
                setAttachments((current) => {
                  const refs = current[edge.id] ?? []
                  refs.filter((ref) => ref.id === id).forEach((ref) => URL.revokeObjectURL(ref.url))
                  return { ...current, [edge.id]: refs.filter((ref) => ref.id !== id) }
                })
              }
            />
            <button type="button" className="chip" onClick={() => setSketchEdgeId(edge.id)}>
              {zh ? '✎ Sketch 手绘板' : '✎ Sketch pad'}
            </button>
            <span className="muted" style={{ fontSize: 11 }}>
              {zh
                ? '支持上传或在此粘贴参考图，附件仅用于当前分支。'
                : 'Upload or paste reference images here. Attachments apply to this branch.'}
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="muted" onClick={() => removeEdge(edge.id)}>
                {t('branchCancel')}
              </button>
              <button type="button" onClick={() => generate(edge)}>
                {t('branchGenerate')}
              </button>
            </div>
          </div>
        ))}
      {sketchEdgeId &&
        createPortal(
          <div
            className="branch-editor"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <SketchPad
              open
              onClose={() => setSketchEdgeId(null)}
              onAdd={(blob) => addRefs(sketchEdgeId, [blob], 'sketch')}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
