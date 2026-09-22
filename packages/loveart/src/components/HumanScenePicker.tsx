import { useMemo, useState } from 'react'
import HumanSceneEditor from './HumanSceneEditor'
import HumanScenePreview from './HumanScenePreview'
import { createDefaultHumanScene } from '../services/humanScene'
import { useT } from '../i18n'
import { useCanvas } from '../store/canvasStore'
import type { HumanScene, HumanSceneAspect } from '../types'

export default function HumanScenePicker({
  projectId,
  aspect,
  value,
  useReference,
  scenes: controlledScenes,
  onCreateScene,
  onUpdateScene,
  onChange,
  onUseReferenceChange,
}: {
  projectId?: string
  aspect: HumanSceneAspect
  value: string | null
  useReference: boolean
  scenes?: HumanScene[]
  onCreateScene?: () => HumanScene
  onUpdateScene?: (scene: HumanScene) => void
  onChange: (sceneId: string | null) => void
  onUseReferenceChange: (useReference: boolean) => void
}) {
  const t = useT()
  const humanScenes = useCanvas((state) => state.humanScenes)
  const scenes = useMemo(
    () => controlledScenes ?? humanScenes.filter((scene) => scene.projectId === projectId),
    [controlledScenes, humanScenes, projectId],
  )
  const addHumanScene = useCanvas((state) => state.addHumanScene)
  const updateHumanScene = useCanvas((state) => state.updateHumanScene)
  const [editing, setEditing] = useState(false)
  const selectedScene = scenes.find((scene) => scene.id === value) ?? null

  function createScene() {
    if (onCreateScene) {
      const scene = onCreateScene()
      onChange(scene.id)
      setEditing(true)
      return
    }
    if (!projectId) return

    const sceneId = addHumanScene(
      createDefaultHumanScene(projectId, `Human Scene ${scenes.length + 1}`, aspect),
    )
    onChange(sceneId)
    setEditing(true)
  }

  function updateScene(scene: HumanScene) {
    if (onUpdateScene) {
      onUpdateScene(scene)
      return
    }

    updateHumanScene(scene.id, {
      projectId: scene.projectId,
      name: scene.name,
      stage: scene.stage,
      people: scene.people,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4, flex: '1 1 180px' }}>
          <span>{t('humanScene')}</span>
          <select
            aria-label={t('humanScene')}
            value={selectedScene?.id ?? ''}
            onChange={(event) => {
              const sceneId = event.target.value || null
              onChange(sceneId)
              if (!sceneId) setEditing(false)
            }}
          >
            <option value="">{t('humanSceneNone')}</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={createScene}>
          {t('humanSceneCreate')}
        </button>

        <button
          type="button"
          disabled={!selectedScene}
          onClick={() => setEditing((current) => !current)}
        >
          {t('humanSceneEdit')}
        </button>
      </div>

      {selectedScene ? (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={useReference}
            onChange={(event) => onUseReferenceChange(event.target.checked)}
          />
          <span>{t('humanSceneReference')}</span>
        </label>
      ) : null}

      {selectedScene && editing ? (
        <HumanSceneEditor scene={selectedScene} onChange={updateScene} />
      ) : selectedScene ? (
        <HumanScenePreview scene={selectedScene} aspect={aspect} />
      ) : null}
    </div>
  )
}
