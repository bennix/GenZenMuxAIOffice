import { useEffect, useRef, useState } from 'react'
import type { ConnectApi, ConnectTarget } from '@genoffice/electron-utils/connect'

const KIND_LABEL: Record<ConnectTarget['kind'], string> = {
  docs: 'Word',
  sheets: 'Excel',
  slides: 'PPT',
  markdown: 'MD',
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
  const rootRef = useRef<HTMLSpanElement>(null)

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
      if (!rootRef.current?.contains(event.target as Node)) setTargets(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [targets])

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
      {targets !== null && (
        <span
          role="menu"
          style={{
            position: 'absolute',
            zIndex: 1000,
            right: 0,
            bottom: 'calc(100% + 6px)',
            width: 230,
            padding: 6,
            border: '1px solid var(--border-color, #d7d7d7)',
            borderRadius: 8,
            background: 'var(--panel-bg, #fff)',
            color: 'var(--text-color, #222)',
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
        </span>
      )}
    </span>
  )
}
