import { describe, expect, it } from 'vitest'
import type { HumanScene } from '../types'
import {
  createDefaultHumanFigure,
  createDefaultHumanScene,
  humanSceneSvg,
  humanSceneToGenerationContext,
  humanSceneSummary,
  humanSceneTextConstraint,
  normalizeHumanScene,
  renderHumanSceneSketch,
} from './humanScene'
import { figureGeometry } from './humanSceneGeometry'

const baseScene: HumanScene = {
  id: 'scene-1',
  projectId: 'p1',
  name: 'Lobby blocking',
  stage: { aspect: '16:9', perspective: 'pseudo-3d' },
  createdAt: 1,
  updatedAt: 1,
  people: [
    {
      id: 'a',
      label: 'Person A',
      x: 18,
      y: 72,
      zDepth: 0.15,
      scale: 1.1,
      facing: 'toward-person',
      facingTargetId: 'b',
      posePreset: 'waving',
      joints: {
        head: 0,
        torso: 0,
        leftArm: 10,
        rightArm: -55,
        leftElbow: 18,
        rightElbow: 18,
        leftLeg: 0,
        rightLeg: 0,
        leftKnee: 12,
        rightKnee: 12,
      },
    },
    {
      id: 'b',
      label: 'Person B',
      x: 70,
      y: 56,
      zDepth: 0.52,
      scale: 0.92,
      facing: 'left',
      posePreset: 'talking',
      joints: {
        head: 0,
        torso: 8,
        leftArm: -12,
        rightArm: 12,
        leftElbow: 18,
        rightElbow: 18,
        leftLeg: 0,
        rightLeg: 0,
        leftKnee: 12,
        rightKnee: 12,
      },
    },
  ],
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

function arrowVector(svg: string): { x: number; y: number } {
  const match = svg.match(
    /data-control="facing-arrow" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
  )

  if (!match) throw new Error('Missing facing arrow')

  return {
    x: Number(match[3]) - Number(match[1]),
    y: Number(match[4]) - Number(match[2]),
  }
}

function unitVector(point: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(point.x, point.y)

  return { x: point.x / length, y: point.y / length }
}

describe('humanScene defaults', () => {
  it('creates a default human scene with one Person A', () => {
    expect(createDefaultHumanScene('p1', 'Scene 1', '9:16')).toEqual({
      projectId: 'p1',
      name: 'Scene 1',
      stage: { aspect: '9:16', perspective: 'pseudo-3d' },
      people: [expect.objectContaining({ label: 'Person A' })],
    })
  })

  it('creates default human figures labeled Person A-D', () => {
    expect([0, 1, 2, 3].map((index) => createDefaultHumanFigure(index).label)).toEqual([
      'Person A',
      'Person B',
      'Person C',
      'Person D',
    ])
  })

  it('creates default figures with editable elbow and knee bend joints', () => {
    expect(createDefaultHumanFigure(0).joints).toEqual(
      expect.objectContaining({
        leftElbow: 18,
        rightElbow: 18,
        leftKnee: 12,
        rightKnee: 12,
      }),
    )
  })
})

describe('normalizeHumanScene', () => {
  it('truncates to first four people and normalizes labels to Person A-D', () => {
    const scene: HumanScene = {
      ...baseScene,
      people: [
        ...baseScene.people,
        createDefaultHumanFigure(2),
        createDefaultHumanFigure(3),
        createDefaultHumanFigure(0),
      ].map((person) => ({ ...person, label: 'Person D' })),
    }

    const normalized = normalizeHumanScene(scene)

    expect(normalized.people).toHaveLength(4)
    expect(normalized.people.map((person) => person.label)).toEqual([
      'Person A',
      'Person B',
      'Person C',
      'Person D',
    ])
    expect(scene.people).toHaveLength(5)
    expect(scene.people.map((person) => person.label)).toEqual([
      'Person D',
      'Person D',
      'Person D',
      'Person D',
      'Person D',
    ])
  })

  it('falls back to a default stage when persisted stage data is missing or invalid', () => {
    const missingStage = { ...baseScene, stage: undefined } as unknown as HumanScene
    const invalidStage = {
      ...baseScene,
      stage: { aspect: '4:3', perspective: 'flat' },
    } as unknown as HumanScene

    expect(normalizeHumanScene(missingStage).stage).toEqual({
      aspect: '16:9',
      perspective: 'pseudo-3d',
    })
    expect(normalizeHumanScene(invalidStage).stage).toEqual({
      aspect: '16:9',
      perspective: 'pseudo-3d',
    })
  })

  it('normalizes non-array persisted people to an empty list', () => {
    const scene = { ...baseScene, people: { id: 'not-an-array' } } as unknown as HumanScene

    expect(normalizeHumanScene(scene).people).toEqual([])
    expect(humanSceneTextConstraint(scene, 'en')).toBe('')
  })

  it('skips null people and normalizes partial malformed people to safe defaults', () => {
    const scene = {
      ...baseScene,
      people: [
        null,
        {
          x: Number.POSITIVE_INFINITY,
          y: -20,
          zDepth: 2,
          scale: 'large',
          facing: 'sideways',
          posePreset: 'jumping',
          joints: null,
        },
      ],
    } as unknown as HumanScene

    const normalized = normalizeHumanScene(scene)

    expect(normalized.people).toEqual([
      {
        id: 'person-1',
        label: 'Person A',
        x: 50,
        y: 0,
        zDepth: 1,
        scale: 1,
        facing: 'front',
        facingTargetId: undefined,
        posePreset: 'standing',
        joints: {
          head: 0,
          torso: 0,
          leftArm: 0,
          rightArm: 0,
          leftLeg: 0,
          rightLeg: 0,
          leftElbow: 18,
          rightElbow: 18,
          leftKnee: 12,
          rightKnee: 12,
        },
      },
    ])
  })

  it('backfills missing elbow and knee joints from older saved scenes', () => {
    const legacyScene = {
      ...baseScene,
      people: baseScene.people.map((person) => ({
        ...person,
        joints: {
          head: person.joints.head,
          torso: person.joints.torso,
          leftArm: person.joints.leftArm,
          rightArm: person.joints.rightArm,
          leftLeg: person.joints.leftLeg,
          rightLeg: person.joints.rightLeg,
        },
      })),
    } as unknown as HumanScene
    const normalized = normalizeHumanScene(legacyScene)

    expect(normalized.people[0].joints).toEqual(
      expect.objectContaining({
        leftElbow: 18,
        rightElbow: 18,
        leftKnee: 12,
        rightKnee: 12,
      }),
    )
  })

  it('clears invalid facing targets so constraints fall back to front-facing language', () => {
    const scene: HumanScene = {
      ...baseScene,
      people: [
        {
          ...baseScene.people[0],
          facingTargetId: 'missing-person',
        },
      ],
    }

    const normalized = normalizeHumanScene(scene)
    const constraint = humanSceneTextConstraint(scene, 'en')

    expect(normalized.people[0].facingTargetId).toBeUndefined()
    expect(constraint).toContain('facing camera')
    expect(constraint).not.toContain('facing Person')
  })
})

describe('humanSceneTextConstraint', () => {
  it('formats Chinese scene constraints', () => {
    const constraint = humanSceneTextConstraint(baseScene, 'zh')

    expect(constraint).toContain('人物场景约束')
    expect(constraint).toContain('共 2 人，必须保持为 2 人')
    expect(constraint).toContain('Person A')
    expect(constraint).toContain('前景')
    expect(constraint).toContain('面向 Person B')
    expect(constraint).toContain('挥手')
    expect(constraint).toContain('Person B')
    expect(constraint).toContain('中景')
    expect(constraint).toContain('交谈')
    expect(constraint).toContain('只约束人物站位、姿势、朝向和空间关系')
  })

  it('formats English scene constraints', () => {
    const constraint = humanSceneTextConstraint(baseScene, 'en')

    expect(constraint).toContain('Human scene constraints')
    expect(constraint).toContain('Exactly 2 people')
    expect(constraint).toContain('Person A')
    expect(constraint).toContain('foreground')
    expect(constraint).toContain('facing Person B')
    expect(constraint).toContain('waving')
    expect(constraint).toContain('blocking, pose, facing, and spatial relation only')
  })

  it('returns an empty constraint when there are no people', () => {
    expect(humanSceneTextConstraint({ ...baseScene, people: [] }, 'en')).toBe('')
  })
})

describe('humanSceneSummary', () => {
  it('summarizes a Chinese human scene', () => {
    expect(humanSceneSummary(baseScene, 'zh')).toBe('Lobby blocking: 2 人，伪 3D 人物站位')
  })

  it('summarizes an English human scene', () => {
    expect(humanSceneSummary(baseScene, 'en')).toBe('Lobby blocking: 2 people, pseudo-3D blocking')
  })
})

describe('human scene sketch rendering', () => {
  it('keeps default SVG output free of annotation controls', () => {
    const svg = humanSceneSvg(baseScene, '16:9')

    expect(svg).not.toContain('data-control=')
    expect(svg).not.toContain('person-box')
    expect(svg).not.toContain('joint-anchor')
    expect(svg).not.toContain('facing-arrow')
  })

  it('can render annotated SVG control marks for conditioning', () => {
    const svg = humanSceneSvg(baseScene, '16:9', { annotations: true })

    expect(svg).toContain('data-control="person-box"')
    expect(svg).toContain('data-control="joint-anchor"')
    expect(svg).toContain('data-joint="rightElbow"')
    expect(svg).toContain('data-joint="rightKnee"')
    expect(svg).toContain('data-control="facing-arrow"')
    expect(svg).toContain('P1')
    expect(svg).toContain('P2')
  })

  it('renders an optional sketch Blob with image mime type', async () => {
    const blob = await renderHumanSceneSketch(baseScene, '16:9')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/svg+xml')
    expect(blob.size).toBeGreaterThan(100)

    const svg = await readBlobText(blob)
    expect(svg).toContain('data-control="person-box"')
    expect(svg).toContain('data-control="joint-anchor"')
    expect(svg).toContain('data-control="facing-arrow"')
  })

  it('adds control mark guidance only when requested for human scene prompts', () => {
    const plain = humanSceneTextConstraint(baseScene, 'en')
    const en = humanSceneTextConstraint(baseScene, 'en', { includeControlGuidance: true })
    const zh = humanSceneTextConstraint(baseScene, 'zh', { includeControlGuidance: true })

    expect(plain).not.toContain('control marks')
    expect(en).toContain('control marks')
    expect(en).toContain('person box labels')
    expect(en).toContain('joint anchors')
    expect(zh).toContain('控制标记')
    expect(zh).toContain('人物框标签')
    expect(zh).toContain('关节点锚点')
  })

  it('aims toward-person arrows using rendered stage coordinates', () => {
    const tallScene: HumanScene = {
      ...baseScene,
      stage: { aspect: '9:16', perspective: 'pseudo-3d' },
      people: [
        {
          ...baseScene.people[0],
          x: 10,
          y: 10,
          zDepth: 0.3,
          facing: 'toward-person',
          facingTargetId: 'b',
        },
        {
          ...baseScene.people[1],
          x: 20,
          y: 90,
          zDepth: 0.3,
        },
      ],
    }
    const svg = humanSceneSvg(tallScene, '9:16', { annotations: true })
    const actual = unitVector(arrowVector(svg))
    const source = figureGeometry(tallScene.people[0], tallScene.people, '9:16')
    const target = figureGeometry(tallScene.people[1], tallScene.people, '9:16')
    const expected = unitVector({
      x: target.base.x - source.base.x,
      y: target.base.y - source.base.y,
    })

    expect(actual.x).toBeCloseTo(expected.x, 2)
    expect(actual.y).toBeCloseTo(expected.y, 2)
  })

  it('returns text context without a reference when includeReference is false', async () => {
    const context = await humanSceneToGenerationContext({
      scene: baseScene,
      aspect: '16:9',
      language: 'en',
      includeReference: false,
    })
    expect(context.textConstraint).toContain('Exactly 2 people')
    expect(context.textConstraint).not.toContain('control marks')
    expect(context.textConstraint).not.toContain('person box labels')
    expect(context.textConstraint).not.toContain('joint anchors')
    expect(context.summary).toBe('Lobby blocking: 2 people, pseudo-3D blocking')
    expect(context.referenceBlob).toBeUndefined()
  })

  it('returns text context and reference when includeReference is true', async () => {
    const context = await humanSceneToGenerationContext({
      scene: baseScene,
      aspect: '16:9',
      language: 'zh',
      includeReference: true,
    })
    expect(context.textConstraint).toContain('共 2 人')
    expect(context.textConstraint).toContain('控制标记')
    expect(context.textConstraint).toContain('人物框标签')
    expect(context.textConstraint).toContain('关节点锚点')
    expect(context.referenceBlob).toBeInstanceOf(Blob)
    expect(context.referenceBlob?.type).toBe('image/svg+xml')
  })
})
