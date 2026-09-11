import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './routes/Home'
import Workspace from './routes/Workspace'
import Settings from './routes/Settings'
import { useSettings, resolveTheme } from './store/settingsStore'

export default function App() {
  const theme = useSettings((s) => s.theme)
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme)
    }
    apply()
    // When following the system, re-apply on OS theme changes.
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/p/:projectId" element={<Workspace />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  )
}
