import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import NoKeyBanner from '../components/NoKeyBanner'
import PromptComposer from '../components/PromptComposer'
import type { Composed } from '../components/PromptComposer'
import { runGeneration } from '../services/generate'
import { useSettings } from '../store/settingsStore'
import { useProjects } from '../store/projectStore'
import { useCanvas } from '../store/canvasStore'
import { useT } from '../i18n'
import type { TKey } from '../i18n'

const CHIPS: TKey[] = [
  'chipLogo',
  'chipPoster',
  'chipVideo',
  'chipBrandKit',
  'chipSocial',
  'chipStoryboard',
]

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const apiKey = useSettings((s) => s.apiKey)
  const createProject = useProjects((s) => s.createProject)
  const projects = useProjects((s) => s.projects)
  const addHumanScene = useCanvas((s) => s.addHumanScene)
  const navigate = useNavigate()
  const t = useT()

  const labels = {
    genDone: t('genDone'),
    genFailed: t('genFailed'),
    reference: t('reference'),
    image: t('modeImage'),
    video: t('modeVideo'),
  }

  // Create a project, kick off the first generation against it (runs in the global stores,
  // independent of which view is mounted), and navigate to its workspace.
  const onSubmit = (c: Composed) => {
    if (!apiKey) return
    const project = createProject(c.text)
    const { humanSceneDraft, ...generationRequest } = c
    const humanSceneId = humanSceneDraft
      ? addHumanScene({
          projectId: project.id,
          name: humanSceneDraft.name,
          stage: humanSceneDraft.stage,
          people: humanSceneDraft.people,
        })
      : c.humanSceneId

    void runGeneration(project.id, {
      ...generationRequest,
      humanSceneId,
      labels,
    })
    navigate(`/p/${project.id}`)
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopNav />
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          gap: 28,
        }}
      >
        <h1
          style={{
            fontSize: 48,
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
            background: 'var(--accent-grad)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {t('heroTitle')}
        </h1>

        <NoKeyBanner />

        <div
          style={{
            width: '100%',
            maxWidth: 720,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: 16,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <PromptComposer
            showImageWizard
            text={prompt}
            onText={setPrompt}
            apiKey={apiKey}
            busy={false}
            placeholder={t('promptPlaceholder')}
            submitLabel={`↑ ${t('create')}`}
            onSubmit={onSubmit}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 720,
          }}
        >
          {CHIPS.map((c) => (
            <button key={c} className="chip" onClick={() => setPrompt(`${t(c)}: `)}>
              {t(c)}
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <div style={{ marginTop: 24, width: '100%', maxWidth: 720 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              {t('recentProjects')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {projects.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => navigate(`/p/${p.id}`)}
                  title={new Date(p.createdAt).toLocaleString()}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
