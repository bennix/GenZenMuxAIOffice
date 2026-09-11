import type { HumanScene, HumanSceneAspect } from '../types'
import { humanSceneSvg } from '../services/humanScene'

export default function HumanScenePreview({
  scene,
  aspect,
  height = 180,
}: {
  scene: HumanScene
  aspect?: HumanSceneAspect
  height?: number
}) {
  const svg = humanSceneSvg(scene, aspect ?? scene.stage.aspect)

  return (
    <div
      aria-label={scene.name}
      style={{
        height,
        width: '100%',
        overflow: 'hidden',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-base)',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
