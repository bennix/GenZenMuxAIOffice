import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from '../../../../packages/loveart/src/App'
import { useSettings } from '../../../../packages/loveart/src/store/settingsStore'
import '../../../../packages/loveart/src/styles/global.css'
import type { OfficeBridge } from '../../../../packages/loveart/src/office-bridge'
import type { SlidesApi } from '../shared/ipc'

async function start() {
  const host = window.parent as Window & { slidesApi?: SlidesApi; slideMaterialHost?: OfficeBridge }
  if (host === window || !host.slidesApi || !host.slideMaterialHost)
    throw new Error('请从 PPT 的 AI 素材入口打开 ArtFlow。')
  window.loveArtOffice = host.slideMaterialHost
  const settings = await host.slidesApi.getAiSettings()
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
