import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from '../../../../packages/loveart/src/App'
import { useSettings } from '../../../../packages/loveart/src/store/settingsStore'
import '../../../../packages/loveart/src/styles/global.css'
import type { OfficeBridge } from '../../../../packages/loveart/src/office-bridge'
import type { DesktopApi } from '../shared/ipc'

async function start() {
  const host = window.parent as Window & { desktop?: DesktopApi; loveArtHost?: OfficeBridge }
  if (host === window || !host.desktop || !host.loveArtHost)
    throw new Error('请从 Office 的 AI 生图入口打开 ArtFlow。')
  window.loveArtOffice = host.loveArtHost
  const settings = await host.desktop.getAiSettings()
  const provider = settings.providers.zenmux
  useSettings.getState().setApiKey(provider.apiKey || '')
  if (provider.model) {
    useSettings.getState().addModel({ id: provider.model, name: provider.model, category: 'chat' })
    useSettings.getState().setDefault(provider.model)
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  )
}
void start().catch((error) => {
  document.getElementById('root')!.textContent = String(error)
})
