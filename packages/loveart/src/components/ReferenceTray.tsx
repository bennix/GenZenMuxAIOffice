import { useRef } from 'react'
import { useT } from '../i18n'

export interface Ref {
  id: string
  kind?: 'sketch'
  blob: Blob
  url: string
}

const uid = () => Math.random().toString(36).slice(2, 10)

export function makeRef(blob: Blob): Ref {
  return { id: uid(), blob, url: URL.createObjectURL(blob) }
}

// A thumbnail tray for reference images. The Image/Video target is driven by the prompt-bar
// mode toggle, not here. State is owned by the parent (AgentPanel).
export default function ReferenceTray({
  refs,
  onAdd,
  onRemove,
}: {
  refs: Ref[]
  onAdd: (blobs: Blob[]) => void
  onRemove: (id: string) => void
}) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFiles = (files: FileList | null) => {
    if (!files) return
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imgs.length) onAdd(imgs)
  }

  if (refs.length === 0) {
    return (
      <div style={{ marginBottom: 8 }}>
        <button className="chip" onClick={() => fileRef.current?.click()} title={t('addReference')}>
          ＋ {t('reference')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            pickFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {refs.map((r) => (
          <div key={r.id} style={{ position: 'relative' }}>
            <img
              src={r.url}
              alt={r.kind === 'sketch' ? 'Sketch' : ''}
              style={{
                width: 48,
                height: 48,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <button
              aria-label={r.kind === 'sketch' ? 'Remove Sketch' : 'Remove reference'}
              onClick={() => onRemove(r.id)}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                background: 'var(--danger)',
                color: '#fff',
                borderRadius: '50%',
                width: 18,
                height: 18,
                fontSize: 11,
                lineHeight: '18px',
              }}
            >
              ✕
            </button>
            {r.kind === 'sketch' && (
              <span style={{ display: 'block', fontSize: 10, textAlign: 'center' }}>Sketch</span>
            )}
          </div>
        ))}
        <button className="chip" onClick={() => fileRef.current?.click()}>
          ＋
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            pickFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
