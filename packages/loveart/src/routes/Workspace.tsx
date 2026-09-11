import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import AgentPanel from '../components/AgentPanel'
import Canvas from '../components/Canvas'
import NoKeyBanner from '../components/NoKeyBanner'
import ImageEditorModal from '../components/ImageEditorModal'
import { useProjects } from '../store/projectStore'
import { useSettings } from '../store/settingsStore'
import { useT } from '../i18n'

export default function Workspace() {
  const { projectId = '' } = useParams()
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId))
  const apiKey = useSettings((s) => s.apiKey)
  const [collapsed, setCollapsed] = useState(false)
  const t = useT()

  if (!project) {
    return (
      <div style={{ padding: 40 }}>
        <p>{t('projectNotFound')}</p>
        <Link to="/" className="btn-ghost">
          ← {t('home')}
        </Link>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" className="muted">
            ← ArtFlow
          </Link>
          <strong>{project.name}</strong>
        </div>
        <Link to="/settings" className="muted">
          ⚙ {t('settings')}
        </Link>
      </header>

      {!apiKey && (
        <div style={{ padding: '0 16px' }}>
          <NoKeyBanner />
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside
          style={{
            width: collapsed ? 44 : 360,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 150ms ease',
            overflow: 'hidden',
          }}
        >
          <button
            className="muted"
            onClick={() => setCollapsed((c) => !c)}
            style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid var(--border)' }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '»' : `« ${t('agent')}`}
          </button>
          {!collapsed && <AgentPanel projectId={projectId} />}
        </aside>

        <Canvas projectId={projectId} />
      </div>

      <ImageEditorModal />
    </div>
  )
}
