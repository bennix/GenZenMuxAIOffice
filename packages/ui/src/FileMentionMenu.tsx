import { useCallback, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import type { OpenFileKind, OpenFileRef } from '@genoffice/electron-utils/open-files'
import { connectMenuPosition } from './ConnectButton'

const KIND_LABEL: Record<OpenFileKind, string> = {
  docs: 'Word',
  sheets: 'Excel',
  slides: 'PPT',
  pdf: 'PDF',
  markdown: 'MD',
}

const MENU_WIDTH = 260
const VIEWPORT_GAP = 8

interface MenuPosition {
  left: number
  top: number
  maxHeight: number
}

export function FileMentionMenu({
  files,
  highlighted,
  notice,
  label,
  anchor,
  onHighlight,
  onSelect,
}: {
  files: readonly OpenFileRef[]
  highlighted: number
  notice: string
  label: string
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'> | null
  onHighlight: (index: number) => void
  onSelect: (file: OpenFileRef) => void
}): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const updatePosition = useCallback(() => {
    if (!anchor) return
    const estimatedHeight = menuRef.current?.offsetHeight || 240
    setPosition(connectMenuPosition(anchor, window.innerWidth, window.innerHeight, estimatedHeight))
  }, [anchor])

  useLayoutEffect(() => {
    if (!anchor) {
      setPosition(null)
      return
    }
    updatePosition()
    const reposition = () => updatePosition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [anchor, files.length, notice, updatePosition])

  if (!anchor) return null

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label={label}
      style={{
        position: 'fixed',
        zIndex: 2147483647,
        left: position?.left ?? VIEWPORT_GAP,
        top: position?.top ?? VIEWPORT_GAP,
        width: Math.min(MENU_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_GAP * 2)),
        maxHeight: position?.maxHeight ?? 240,
        overflowY: 'auto',
        padding: 6,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface)',
        color: 'var(--text)',
        boxShadow: 'var(--shadow-modal-strong)',
      }}
    >
      {notice ? (
        <span
          style={{ display: 'block', padding: 8, fontSize: 12, color: 'var(--text-secondary)' }}
        >
          {notice}
        </span>
      ) : (
        files.map((file, index) => (
          <button
            key={file.id}
            type="button"
            role="option"
            aria-selected={index === highlighted}
            onMouseEnter={() => onHighlight(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(file)
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '7px 9px',
              border: 0,
              borderRadius: 6,
              background: index === highlighted ? 'var(--hover)' : 'transparent',
              color: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'block' }}>
              {KIND_LABEL[file.kind]} · {file.title}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 11,
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {file.filePath}
            </span>
          </button>
        ))
      )}
    </div>,
    document.body,
  )
}
