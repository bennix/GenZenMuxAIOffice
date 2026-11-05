import { useEffect, useState } from 'react'
import type { OfficeBridge } from '../../../../../packages/loveart/src/office-bridge'
import type { AiNetworkBridge } from '../../../../../packages/loveart/src/services/network'
import { useI18n } from '../i18n/locale'
import './ai-material-studio.css'

declare global {
  interface Window {
    slideMaterialHost?: OfficeBridge
    aiNetwork?: AiNetworkBridge
  }
}

export function AiMaterialStudio({
  open,
  onClose,
  onInsertImage,
  onInsertVideo,
}: {
  open: boolean
  onClose: () => void
  onInsertImage: (dataUrl: string) => Promise<void>
  onInsertVideo: (dataUrl: string) => Promise<void>
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh' || lang === 'zh-TW'
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const bridge: OfficeBridge = {
      insertLabel: zh ? '插入当前幻灯片' : 'Insert into current slide',
      insertImage: onInsertImage,
      insertVideo: onInsertVideo,
      listImageTargets: () => window.slidesApi.listImageShareTargets(),
      shareImage: (target, dataUrl) => window.slidesApi.shareImage(target, dataUrl),
      fetchImage: async (url) => {
        const image = await window.aiNetwork?.fetchAsset?.(url)
        if (!image || !image.mime.startsWith('image/')) throw new Error('Image download failed')
        return image
      },
      fetchMedia: async (url) => (await window.aiNetwork?.fetchAsset?.(url)) ?? null,
      saveApiKey: async (apiKey) => {
        const settings = await window.slidesApi.getAiSettings()
        await window.slidesApi.setAiSettings({
          ...settings,
          providers: { ...settings.providers, zenmux: { ...settings.providers.zenmux, apiKey } },
        })
      },
    }
    window.slideMaterialHost = bridge
    setReady(true)
    return () => {
      if (window.slideMaterialHost === bridge) delete window.slideMaterialHost
    }
  }, [onInsertImage, onInsertVideo, zh])
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [open, onClose])
  return (
    <div className="slide-material-backdrop" style={{ display: open ? undefined : 'none' }}>
      <section
        className="slide-material-studio"
        role="dialog"
        aria-modal="true"
        aria-label={zh ? 'AI 素材工作台' : 'AI asset studio'}
      >
        <header>
          <div>
            <strong>{zh ? 'AI 素材 · 图片与视频' : 'AI assets · Images & video'}</strong>
            <p>
              {zh
                ? '生成后在素材卡片上点“插入当前幻灯片”。图片和 MP4 视频作为独立对象导入，支持继续排版。'
                : 'Choose “Insert into current slide” on an image or MP4 card. Assets remain separate objects for layout.'}
            </p>
          </div>
          <button onClick={onClose}>{zh ? '返回 PPT' : 'Back to slides'}</button>
        </header>
        {ready && <iframe title={zh ? 'AI 素材创作' : 'AI asset creation'} src="./loveart.html" />}
      </section>
    </div>
  )
}
