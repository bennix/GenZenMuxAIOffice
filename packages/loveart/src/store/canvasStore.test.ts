import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvas } from './canvasStore'
import { useSettings } from './settingsStore'

function resetCanvasStore() {
  useCanvas.setState({
    cards: [],
    edges: [],
    humanScenes: [],
    viewports: {},
  })
}

function addSourceCard(idFields = {}) {
  return useCanvas.getState().addCard({
    projectId: 'project-1',
    type: 'image',
    status: 'ready',
    prompt: 'original prompt',
    model: 'openai/gpt-image-2',
    url: 'data:image/png;base64,source',
    x: 100,
    y: 120,
    w: 320,
    h: 320,
    ...idFields,
  })
}

describe('canvasStore edges', () => {
  beforeEach(() => {
    useSettings.setState({
      models: [
        { id: 'openai/custom-image', name: 'Custom Image', category: 'image', isDefault: true },
        { id: 'bytedance/custom-video', name: 'Custom Video', category: 'video', isDefault: true },
        { id: 'anthropic/custom-chat', name: 'Custom Chat', category: 'chat', isDefault: true },
      ],
    })
    resetCanvasStore()
  })

  it('creates a persisted branch draft with default image output and source reference on', () => {
    const sourceCardId = addSourceCard()

    const edgeId = useCanvas.getState().createBranchDraft(sourceCardId, {
      x: 560,
      y: 220,
    })

    expect(useCanvas.getState().edges).toEqual([
      expect.objectContaining({
        id: edgeId,
        projectId: 'project-1',
        sourceCardId,
        prompt: '',
        outputMode: 'image',
        model: 'openai/custom-image',
        useSourceAsReference: true,
        sourceAnchor: 'right',
        targetX: 560,
        targetY: 220,
        status: 'draft',
      }),
    ])
  })

  it('updates prompt, output mode, reference toggle, and target card', () => {
    const sourceCardId = addSourceCard()
    const edgeId = useCanvas.getState().createBranchDraft(sourceCardId, { x: 560, y: 220 })
    const targetCardId = useCanvas.getState().addCard({
      projectId: 'project-1',
      type: 'video',
      status: 'generating',
      prompt: 'make a video',
      x: 560,
      y: 220,
      w: 400,
      h: 240,
    })

    useCanvas.getState().updateEdge(edgeId, {
      prompt: 'make it warmer',
      outputMode: 'video',
      useSourceAsReference: false,
    })
    useCanvas.getState().attachEdgeTarget(edgeId, targetCardId)

    expect(useCanvas.getState().edges[0]).toMatchObject({
      prompt: 'make it warmer',
      outputMode: 'video',
      useSourceAsReference: false,
      targetCardId,
    })
  })

  it('removes edges when the source card is deleted', () => {
    const sourceCardId = addSourceCard()
    const edgeId = useCanvas.getState().createBranchDraft(sourceCardId, { x: 560, y: 220 })

    useCanvas.getState().removeCard(sourceCardId)

    expect(useCanvas.getState().edges.some((edge) => edge.id === edgeId)).toBe(false)
  })

  it('keeps an edge but clears target when the target card is deleted', () => {
    const sourceCardId = addSourceCard()
    const edgeId = useCanvas.getState().createBranchDraft(sourceCardId, { x: 560, y: 220 })
    const targetCardId = useCanvas.getState().addCard({
      projectId: 'project-1',
      type: 'image',
      status: 'ready',
      prompt: 'target',
      x: 560,
      y: 220,
      w: 320,
      h: 320,
    })
    useCanvas.getState().attachEdgeTarget(edgeId, targetCardId)
    useCanvas.getState().updateEdge(edgeId, { status: 'ready' })

    useCanvas.getState().removeCard(targetCardId)

    expect(useCanvas.getState().edges[0]).toMatchObject({
      id: edgeId,
      sourceCardId,
      targetCardId: undefined,
      status: 'draft',
    })
  })
})

describe('human scene store', () => {
  beforeEach(() => {
    resetCanvasStore()
  })

  it('adds, updates, duplicates, lists, and removes human scenes', () => {
    const canvas = useCanvas.getState()
    const sceneId = canvas.addHumanScene({
      projectId: 'p1',
      name: 'Lobby blocking',
      stage: { aspect: '16:9', perspective: 'pseudo-3d' },
      people: [],
    })

    expect(useCanvas.getState().humanScenesFor('p1')).toHaveLength(1)
    expect(useCanvas.getState().humanScenesFor('p1')[0]).toMatchObject({
      id: sceneId,
      name: 'Lobby blocking',
      projectId: 'p1',
    })
    expect(useCanvas.getState().humanScenesFor('p1')[0].createdAt).toBeTypeOf('number')
    expect(useCanvas.getState().humanScenesFor('p1')[0].updatedAt).toBeTypeOf('number')

    useCanvas.getState().updateHumanScene(sceneId, { name: 'Updated blocking' })
    expect(useCanvas.getState().humanScenesFor('p1')[0].name).toBe('Updated blocking')

    const duplicateId = useCanvas.getState().duplicateHumanScene(sceneId)
    expect(duplicateId).not.toBe(sceneId)
    expect(useCanvas.getState().humanScenesFor('p1')).toHaveLength(2)
    expect(
      useCanvas
        .getState()
        .humanScenesFor('p1')
        .find((scene) => scene.id === duplicateId),
    ).toMatchObject({
      name: 'Updated blocking copy',
      projectId: 'p1',
    })

    useCanvas.getState().removeHumanScene(sceneId)
    expect(
      useCanvas
        .getState()
        .humanScenesFor('p1')
        .map((scene) => scene.id),
    ).toEqual([duplicateId])
  })

  it('keeps generated cards when a human scene card is removed', () => {
    const sceneId = useCanvas.getState().addHumanScene({
      projectId: 'p1',
      name: 'Two-person blocking',
      stage: { aspect: '16:9', perspective: 'pseudo-3d' },
      people: [],
    })
    const sceneCardId = useCanvas.getState().addCard({
      projectId: 'p1',
      type: 'humanScene',
      status: 'ready',
      humanSceneId: sceneId,
      x: 10,
      y: 20,
      w: 320,
      h: 220,
    })
    const videoCardId = useCanvas.getState().addCard({
      projectId: 'p1',
      type: 'video',
      status: 'ready',
      url: 'https://example.com/video.mp4',
      x: 420,
      y: 20,
      w: 400,
      h: 240,
    })

    useCanvas.getState().removeCard(sceneCardId)

    expect(useCanvas.getState().cards.map((card) => card.id)).toEqual([videoCardId])
    expect(useCanvas.getState().humanScenesFor('p1')).toHaveLength(1)
  })

  it('creates a human scene card linked to scene data', () => {
    const sceneId = useCanvas.getState().addHumanScene({
      projectId: 'p1',
      name: 'Blocking',
      stage: { aspect: '16:9', perspective: 'pseudo-3d' },
      people: [],
    })
    const cardId = useCanvas.getState().addCard({
      projectId: 'p1',
      type: 'humanScene',
      status: 'ready',
      humanSceneId: sceneId,
      x: 80,
      y: 80,
      w: 320,
      h: 220,
    })

    expect(useCanvas.getState().cards.find((card) => card.id === cardId)).toMatchObject({
      type: 'humanScene',
      humanSceneId: sceneId,
    })
  })

  it('duplicates people as distinct objects while preserving figure data', () => {
    const sceneId = useCanvas.getState().addHumanScene({
      projectId: 'p1',
      name: 'Blocking with person',
      stage: { aspect: '16:9', perspective: 'pseudo-3d' },
      people: [
        {
          id: 'person-1',
          label: 'Person A',
          x: 100,
          y: 120,
          zDepth: 1,
          scale: 1,
          facing: 'front',
          posePreset: 'standing',
          joints: {
            head: 0,
            torso: 0,
            leftArm: 0,
            rightArm: 0,
            leftElbow: 18,
            rightElbow: 18,
            leftLeg: 0,
            rightLeg: 0,
            leftKnee: 12,
            rightKnee: 12,
          },
        },
      ],
    })

    const duplicateId = useCanvas.getState().duplicateHumanScene(sceneId)
    const scenes = useCanvas.getState().humanScenesFor('p1')
    const sourcePerson = scenes.find((scene) => scene.id === sceneId)?.people[0]
    const duplicatePerson = scenes.find((scene) => scene.id === duplicateId)?.people[0]

    expect(duplicatePerson).toEqual(sourcePerson)
    expect(duplicatePerson).not.toBe(sourcePerson)
    expect(duplicatePerson?.joints).toEqual(sourcePerson?.joints)
    expect(duplicatePerson?.joints).not.toBe(sourcePerson?.joints)
  })
})
