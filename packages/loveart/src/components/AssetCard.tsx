import { insertOfficeImage } from '../office-bridge'
import { useRef, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Card } from '../types'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'
import { generateImage } from '../services/zenmux'
import { optimizePromptForGenerationOrOriginal } from '../services/agent'
import { getAsset, deleteAsset, storeMedia } from '../services/assetStore'
import { useEditor } from '../store/editorStore'
import { useSelection } from '../store/selectionStore'
import { useChat } from '../store/chatStore'
import { useT } from '../i18n'
import HumanScenePreview from './HumanScenePreview'

interface AssetCardProps {
  card: Card
  scale: number
  onBranchStart?: (card: Card, event: React.PointerEvent) => void
}

// A draggable asset card on the canvas. Drag is computed in canvas-space using the
// current zoom scale so movement tracks the cursor regardless of zoom.
export default function AssetCard({ card, scale, onBranchStart }: AssetCardProps) {
  const updateCard = useCanvas((state) => state.updateCard)
  const removeCard = useCanvas((state) => state.removeCard)
  const duplicateCard = useCanvas((state) => state.duplicateCard)
  const humanScene = useCanvas((state) =>
    card.type === 'humanScene' && card.humanSceneId
      ? state.humanScenes.find((scene) => scene.id === card.humanSceneId)
      : undefined,
  )
  const defaultModel = useSettings((s) => s.defaultModel)
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const modelName = useSettings((s) => s.models.find((model) => model.id === card.model)?.name)
  const openEditor = useEditor((s) => s.open)
  const selected = useSelection((s) => s.ids.includes(card.id))
  const dragging = useRef<{ ox: number; oy: number } | null>(null)
  const humanScenePreviewHeight = Math.max(80, card.h - 86)

  // Resolve display source: IndexedDB-backed blobs become object URLs (revoked on cleanup);
  // remote URLs are used directly.
  const [src, setSrc] = useState<string | undefined>(card.url)
  const [inserting, setInserting] = useState(false)
  const [insertStatus, setInsertStatus] = useState('')
  const [playbackError, setPlaybackError] = useState(false)
  useEffect(() => {
    setPlaybackError(false)
  }, [src])
  const canDownload = (card.type === 'image' || card.type === 'video') && src
  useEffect(() => {
    setSrc(card.url)
    if (!card.assetId) {
      return
    }
    let objectUrl: string | undefined
    let cancelled = false
    getAsset(card.assetId)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc(card.url)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [card.assetId, card.url])

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest('button, video, a, input, select')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging.current = { ox: e.clientX - card.x * scale, oy: e.clientY - card.y * scale }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    updateCard(card.id, {
      x: (e.clientX - dragging.current.ox) / scale,
      y: (e.clientY - dragging.current.oy) / scale,
    })
  }
  const onPointerUp = () => {
    dragging.current = null
  }
  const onBranchPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    onBranchStart?.(card, e)
  }

  const regenerate = async () => {
    if (card.type !== 'image' || !card.prompt) return
    const model = card.model ?? defaultModel('image')?.id
    if (!model) return
    const oldAssetId = card.assetId
    updateCard(card.id, { status: 'generating', error: undefined })
    try {
      useChat.getState().addMessage(card.projectId, 'user', `重新生成：${card.prompt}`)
      const optimizedPrompt = await optimizePromptForGenerationOrOriginal(
        card.projectId,
        card.prompt,
      )
      const urls = await generateImage(model, optimizedPrompt, '1024x1024', 1)
      const media = await storeMedia(urls[0])
      updateCard(card.id, { status: 'ready', prompt: optimizedPrompt, model, ...media })
      if (oldAssetId && oldAssetId !== media.assetId) void deleteAsset(oldAssetId)
    } catch (e) {
      updateCard(card.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Download via fetch→blob so it works for both blob: object URLs and cross-origin remote
  // URLs (where the <a download> attribute is ignored by browsers).
  const download = async () => {
    if (!src) return
    try {
      const blob = await (await fetch(src)).blob()
      const ext = card.type === 'video' ? 'mp4' : blob.type.split('/')[1] || 'png'
      const name = `${(card.prompt || card.type).slice(0, 40).replace(/[^\w-]+/g, '_') || 'asset'}.${ext}`
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch {
      // Last resort: open in a new tab so the user can save manually.
      window.open(src, '_blank')
    }
  }

  // Delete the blob only if no other card still references it (duplicates share an assetId).
  const onDelete = () => {
    if (card.assetId) {
      const shared = useCanvas
        .getState()
        .cards.some((c) => c.id !== card.id && c.assetId === card.assetId)
      if (!shared) void deleteAsset(card.assetId)
    }
    removeCard(card.id)
  }

  return (
    <div
      className="rise"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      style={{
        position: 'absolute',
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
        background: 'var(--bg-surface)',
        border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: selected ? 'var(--glow-accent)' : 'var(--shadow-card)',
        overflow: 'hidden',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {card.status === 'generating' && (
          <div
            className="shimmer"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              Generating…
            </span>
          </div>
        )}
        {card.status === 'failed' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
          >
            <span style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center' }}>
              {card.error || 'Failed'}
            </span>
            {card.type !== 'humanScene' && (
              <button className="btn-ghost" onClick={regenerate}>
                Retry
              </button>
            )}
          </div>
        )}
        {card.status === 'ready' && card.type === 'image' && (
          <img
            src={src}
            alt={card.prompt}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            draggable={false}
          />
        )}
        {card.status === 'ready' && card.type === 'video' && (
          <video
            src={src}
            controls
            playsInline
            preload="metadata"
            onError={() => setPlaybackError(true)}
            onLoadedData={() => setPlaybackError(false)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              background: '#000',
              cursor: 'auto',
              touchAction: 'auto',
            }}
          />
        )}
        {card.status === 'ready' && card.type === 'video' && playbackError && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              inset: 'auto 8px 48px',
              padding: 8,
              background: 'var(--bg-surface)',
              fontSize: 12,
            }}
          >
            {lang === 'zh'
              ? '视频加载失败，地址可能已过期或格式不受支持。'
              : 'Video could not load. The URL may have expired or the format is unsupported.'}
            {src && (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {lang === 'zh' ? '打开原视频' : 'Open video'}
              </a>
            )}
          </div>
        )}
        {card.status === 'ready' &&
          card.type === 'humanScene' &&
          (humanScene ? (
            <div
              style={{
                height: '100%',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxSizing: 'border-box',
              }}
            >
              <strong
                style={{
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={humanScene.name}
              >
                {humanScene.name}
              </strong>
              <HumanScenePreview scene={humanScene} height={humanScenePreviewHeight} />
            </div>
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 12,
                textAlign: 'center',
              }}
            >
              <span className="muted" style={{ fontSize: 12 }}>
                Human scene unavailable
              </span>
            </div>
          ))}
        {card.type === 'note' && (
          <div
            className="md"
            style={{ padding: 12, fontSize: 14, overflow: 'auto', height: '100%' }}
          >
            <ReactMarkdown>{card.text ?? ''}</ReactMarkdown>
          </div>
        )}
        {onBranchStart && card.status === 'ready' && card.type === 'image' && (
          <button
            aria-label={t('branchStart')}
            title={t('branchStart')}
            onPointerDown={onBranchPointerDown}
            style={{
              position: 'absolute',
              right: -18,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 34,
              height: 44,
              borderRadius: 'var(--radius-pill)',
              border: '2px solid rgba(255,255,255,0.9)',
              background: 'var(--accent-grad)',
              color: '#fff',
              boxShadow: '0 8px 22px rgba(124, 92, 255, 0.35), var(--shadow-popover)',
              cursor: 'crosshair',
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1,
              transition: 'transform 120ms ease, box-shadow 120ms ease',
              zIndex: 2,
            }}
          >
            +
          </button>
        )}
      </div>

      {/* Footer / actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '6px 8px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span
          className="muted"
          style={{ fontSize: 11, overflowWrap: 'anywhere' }}
          title={humanScene?.name ?? card.model ?? card.prompt}
        >
          {humanScene?.name ??
            modelName ??
            card.model ??
            (card.type === 'image' || card.type === 'video'
              ? lang === 'zh'
                ? '模型来源未记录'
                : 'Model not recorded'
              : card.type)}
        </span>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {card.type === 'image' && card.status === 'ready' && (
            <>
              <button
                className="muted"
                title={t('editImage') + ' · ' + t('photoEnhance')}
                onClick={() => openEditor(card.id)}
              >
                ✎
              </button>
              <button className="muted" title="Regenerate" onClick={regenerate}>
                ⟳
              </button>
            </>
          )}
          {card.type === 'image' && src && window.loveArtOffice && (
            <button
              className="btn-accent"
              disabled={inserting}
              title={insertStatus || '插入当前文档'}
              onClick={async () => {
                setInserting(true)
                setInsertStatus('')
                try {
                  await insertOfficeImage(src)
                  setInsertStatus('已插入文档')
                } catch (error) {
                  setInsertStatus(error instanceof Error ? error.message : String(error))
                } finally {
                  setInserting(false)
                }
              }}
            >
              {inserting ? '插入中…' : '插入文档'}
            </button>
          )}
          {insertStatus && <span role="status">{insertStatus}</span>}
          {canDownload && (
            <button className="muted" onClick={download} title="Download">
              ↓
            </button>
          )}
          <button className="muted" title="Duplicate" onClick={() => duplicateCard(card.id)}>
            ⧉
          </button>
          <button className="muted" title="Delete" onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
