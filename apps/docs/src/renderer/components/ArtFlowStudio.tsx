import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { OfficeBridge } from '../../../../../packages/loveart/src/office-bridge'
import { insertImageFromDataUrl } from './ribbon-tabs'
import './office-studios.css'

declare global {
  interface Window {
    loveArtHost?: OfficeBridge
  }
}

export function ArtFlowStudio({
  editor,
  open,
  onClose,
}: {
  editor: Editor
  open: boolean
  onClose: () => void
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const bridge: OfficeBridge = {
      listImageTargets: () => window.desktop.listImageShareTargets(),
      shareImage: (targetId, dataUrl) => window.desktop.shareImage(targetId, dataUrl),
      saveApiKey: async (apiKey) => {
        const settings = await window.desktop.getAiSettings()
        await window.desktop.setAiSettings({
          ...settings,
          providers: { ...settings.providers, zenmux: { ...settings.providers.zenmux, apiKey } },
        })
      },
      fetchImage: (url) => window.desktop.fetchImage(url),
      insertImage: async (dataUrl) => {
        if (editor.isDestroyed) throw new Error('文档已关闭。')
        if (!(await insertImageFromDataUrl(editor, dataUrl, 'ArtFlow AI 图片')))
          throw new Error('图片插入失败，请重试。')
      },
    }
    window.loveArtHost = bridge
    setReady(true)
    return () => {
      if (window.loveArtHost === bridge) delete window.loveArtHost
    }
  }, [editor])
  return (
    <div
      className="modal-backdrop office-studio-backdrop"
      style={{ display: open ? undefined : 'none' }}
    >
      <section
        className="office-studio"
        role="dialog"
        aria-modal="true"
        aria-label="ArtFlow AI 生图"
      >
        <header>
          <div>
            <strong>ArtFlow · AI 生图</strong>
            <span>参考图、风格模板与画布创作 · 在图片卡片上选择「插入文档」</span>
          </div>
          <button onClick={onClose} autoFocus>
            返回文档
          </button>
        </header>
        {ready && <iframe title="ArtFlow 创作工作台" src="./loveart.html" />}
      </section>
    </div>
  )
}
