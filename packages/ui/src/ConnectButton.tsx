import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ConnectApi, ConnectTarget } from '@genoffice/electron-utils/connect'

const KIND_LABEL: Record<ConnectTarget['kind'], string> = {
  docs: 'Word',
  sheets: 'Excel',
  slides: 'PPT',
  markdown: 'MD',
}

const MENU_WIDTH = 230
const VIEWPORT_GAP = 8
const ANCHOR_GAP = 6

interface MenuPosition {
  left: number
  top: number
  maxHeight: number
}

export function connectMenuPosition(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  viewportWidth: number,
  viewportHeight: number,
  estimatedHeight = 240,
): MenuPosition {
  const width = Math.min(MENU_WIDTH, Math.max(0, viewportWidth - VIEWPORT_GAP * 2))
  const left = Math.min(
    Math.max(VIEWPORT_GAP, anchor.right - width),
    Math.max(VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP),
  )
  const roomAbove = anchor.top - VIEWPORT_GAP - ANCHOR_GAP
  const roomBelow = viewportHeight - anchor.bottom - VIEWPORT_GAP - ANCHOR_GAP
  const openAbove = roomAbove >= Math.min(estimatedHeight, 120) || roomAbove >= roomBelow
  const maxHeight = Math.max(80, openAbove ? roomAbove : roomBelow)
  const top = openAbove
    ? Math.max(VIEWPORT_GAP, anchor.top - ANCHOR_GAP - Math.min(estimatedHeight, maxHeight))
    : anchor.bottom + ANCHOR_GAP
  return { left, top, maxHeight }
}

export function ConnectButton({
  api,
  text,
  triggerNonce = 0,
}: {
  api: ConnectApi
  text: string
  triggerNonce?: number
}) {
  const [targets, setTargets] = useState<ConnectTarget[] | null>(null)
  const [notice, setNotice] = useState('')
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updateMenuPosition = useCallback(() => {
    const anchor = rootRef.current?.getBoundingClientRect()
    if (!anchor) return
    const estimatedHeight = menuRef.current?.offsetHeight || 240
    setMenuPosition(
      connectMenuPosition(anchor, window.innerWidth, window.innerHeight, estimatedHeight),
    )
  }, [])

  const open = async () => {
    if (!text.trim()) {
      setNotice('暂无可发送的 AI 回复 / No AI reply yet')
      setTargets([])
      return
    }
    const next = await api.listConnectTargets()
    setTargets(next)
    setNotice(next.length ? '' : '请先打开另一个可编辑文件 / Open another editable file')
  }

  useEffect(() => {
    if (triggerNonce > 0) void open()
    // triggerNonce deliberately owns the command-driven opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNonce])

  useEffect(() => {
    if (targets === null) return
    const close = (event: MouseEvent) => {
      const node = event.target as Node
      if (!rootRef.current?.contains(node) && !menuRef.current?.contains(node)) setTargets(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [targets])

  useLayoutEffect(() => {
    if (targets === null) {
      setMenuPosition(null)
      return
    }
    updateMenuPosition()
    const reposition = () => updateMenuPosition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [targets, updateMenuPosition])

  const send = async (target: ConnectTarget) => {
    const result = await api.sendConnect(target.id, text)
    setTargets(null)
    if (!result.ok) setNotice('发送失败，请重试 / Send failed')
  }

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="ai-msg-tool-btn"
        onClick={() => void open()}
        aria-label="发送到其他编辑器 / Connect to another editor"
        data-tip="@Connect · 发送到 Word / PPT / MD / Excel"
      >
        ↗
      </button>
      {targets !== null &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              zIndex: 2147483647,
              left: menuPosition?.left ?? VIEWPORT_GAP,
              top: menuPosition?.top ?? VIEWPORT_GAP,
              width: Math.min(MENU_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_GAP * 2)),
              maxHeight: menuPosition?.maxHeight ?? 240,
              overflowY: 'auto',
              padding: 6,
              border: '1px solid var(--border-color, #d7d7d7)',
              borderRadius: 8,
              background: 'var(--panel-bg, Canvas)',
              color: 'var(--text-color, CanvasText)',
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            }}
          >
            {notice && <span style={{ display: 'block', padding: 8, fontSize: 12 }}>{notice}</span>}
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                role="menuitem"
                onClick={() => void send(target)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '7px 9px',
                  border: 0,
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {KIND_LABEL[target.kind]} · {target.title}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  )
}
