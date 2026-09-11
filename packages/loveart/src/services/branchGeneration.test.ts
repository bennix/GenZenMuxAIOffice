import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'
import type { CanvasEdge, Card } from '../types'
import { buildBranchBrief, runBranchGeneration } from './branchGeneration'
import { editImages, generateImage, generateVideo } from './zenmux'
import { storeMedia } from './assetStore'
import { optimizePromptForGenerationOrOriginal } from './agent'
import { blobForCard, mergeRefsForVideo } from './edits'

vi.mock('./zenmux', () => ({
  editImages: vi.fn(async () => ['data:image/png;base64,edited']),
  generateImage: vi.fn(async () => ['data:image/png;base64,new']),
  generateVideo: vi.fn(async () => 'data:video/mp4;base64,video'),
}))
vi.mock('./assetStore', () => ({
  storeMedia: vi.fn(async (_url: string) => ({ url: _url, assetId: 'asset-new' })),
}))
vi.mock('./edits', () => ({
  blobForCard: vi.fn(async () => new Blob(['source'], { type: 'image/png' })),
  blobToBase64: vi.fn(async () => 'merged-reference-base64'),
  editModelId: vi.fn(() => 'openai/gpt-image-2'),
  mergeRefsForVideo: vi.fn(async () => new Blob(['merged'], { type: 'image/jpeg' })),
}))
vi.mock('./agent', () => ({
  optimizePromptForGenerationOrOriginal: vi.fn(
    async (_projectId: string, prompt: string) => prompt,
  ),
}))

const sourceImage: Card = {
  id: 'source-1',
  projectId: 'project-1',
  type: 'image',
  status: 'ready',
  url: 'data:image/png;base64,source',
  prompt: 'original landscape prompt',
  x: 100,
  y: 120,
  w: 320,
  h: 320,
}

const targetImage: Card = {
  id: 'target-1',
  projectId: 'project-1',
  type: 'image',
  status: 'generating',
  prompt: 'make it neon',
  x: 560,
  y: 220,
  w: 320,
  h: 320,
}

const humanScene = {
  id: 'scene-1',
  projectId: 'project-1',
  name: 'Two person blocking',
  stage: { aspect: '16:9' as const, perspective: 'pseudo-3d' as const },
  people: [
    {
      id: 'person-a',
      label: 'Person A' as const,
      x: 0.35,
      y: 0.6,
      zDepth: 0.2,
      scale: 1,
      facing: 'right' as const,
      facingTargetId: 'person-b',
      posePreset: 'standing' as const,
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
    {
      id: 'person-b',
      label: 'Person B' as const,
      x: 0.65,
      y: 0.6,
      zDepth: 0.2,
      scale: 1,
      facing: 'left' as const,
      facingTargetId: 'person-a',
      posePreset: 'talking' as const,
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
  createdAt: 1,
  updatedAt: 1,
}

function branchEdge(patch: Partial<CanvasEdge> = {}): CanvasEdge {
  return {
    id: 'edge-1',
    projectId: 'project-1',
    sourceCardId: 'source-1',
    targetCardId: 'target-1',
    prompt: 'make it neon',
    outputMode: 'image',
    useSourceAsReference: true,
    sourceAnchor: 'right',
    targetX: 560,
    targetY: 220,
    status: 'generating',
    ...patch,
  }
}

function setCanvas(edge: CanvasEdge, target: Card = targetImage, source: Card = sourceImage) {
  useCanvas.setState({ cards: [source, target], edges: [edge], humanScenes: [], viewports: {} })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('branch generation service', () => {
  it.each([true, false])(
    'passes selected 30-second duration to video generation with source reference %s',
    async (useSourceAsReference) => {
      setCanvas(
        branchEdge({
          outputMode: 'video',
          model: 'bytedance/doubao-seedance-2.5',
          duration: 30,
          useSourceAsReference,
        }),
        { ...targetImage, type: 'video' },
      )
      await runBranchGeneration('project-1', 'edge-1')
      expect(generateVideo).toHaveBeenCalledWith(
        'bytedance/doubao-seedance-2.5',
        expect.any(String),
        expect.objectContaining({ duration: 30 }),
      )
    },
  )
  it('normalizes a saved duration after switching to Veo', async () => {
    setCanvas(
      branchEdge({
        outputMode: 'video',
        model: 'google/veo-3.1-generate-001',
        duration: 30,
        useSourceAsReference: false,
      }),
      { ...targetImage, type: 'video' },
    )
    await runBranchGeneration('project-1', 'edge-1')
    expect(generateVideo).toHaveBeenCalledWith(
      'google/veo-3.1-generate-001',
      expect.any(String),
      expect.objectContaining({ duration: 8 }),
    )
  })
  beforeEach(() => {
    vi.clearAllMocks()
    useSettings.setState({ lang: 'en' })
    setCanvas(branchEdge())
  })

  it('uses image edit for image source to image output with reference on and marks target and edge ready', async () => {
    await runBranchGeneration('project-1', 'edge-1')

    expect(editImages).toHaveBeenCalledTimes(1)
    expect(editImages).toHaveBeenCalledWith(
      [expect.any(Blob)],
      expect.stringContaining('make it neon'),
      { model: 'openai/gpt-image-2', n: 1, size: '1024x1024' },
    )
    expect(generateImage).not.toHaveBeenCalled()
    expect(storeMedia).toHaveBeenCalledWith('data:image/png;base64,edited')
    expect(useCanvas.getState().cards.find((card) => card.id === 'target-1')).toMatchObject({
      status: 'ready',
      url: 'data:image/png;base64,edited',
      assetId: 'asset-new',
    })
    expect(useCanvas.getState().edges[0]).toMatchObject({ status: 'ready' })
  })

  it('uses image reference payload for image source to video output with reference on', async () => {
    setCanvas(branchEdge({ outputMode: 'video', model: 'google/veo-3.1-fast-generate-001' }), {
      ...targetImage,
      type: 'video',
      w: 400,
      h: 240,
    })

    await runBranchGeneration('project-1', 'edge-1')

    expect(generateVideo).toHaveBeenCalledTimes(1)
    expect(generateVideo).toHaveBeenCalledWith(
      'google/veo-3.1-fast-generate-001',
      expect.stringContaining('make it neon'),
      {
        image: { base64: 'merged-reference-base64', mimeType: 'image/jpeg' },
        aspect: '16:9',
        duration: 8,
      },
    )
    expect(useCanvas.getState().cards.find((card) => card.id === 'target-1')).toMatchObject({
      status: 'ready',
      url: 'data:video/mp4;base64,video',
      assetId: 'asset-new',
    })
  })

  it('keeps video source reference context for video branches even without image payload support', async () => {
    const sourceVideo: Card = {
      ...sourceImage,
      id: 'source-1',
      type: 'video',
      url: 'data:video/mp4;base64,source-video',
      prompt: 'original video motion prompt',
      w: 400,
      h: 240,
    }
    setCanvas(
      branchEdge({ outputMode: 'video', useSourceAsReference: true }),
      { ...targetImage, type: 'video', w: 400, h: 240 },
      sourceVideo,
    )

    await runBranchGeneration('project-1', 'edge-1')

    expect(optimizePromptForGenerationOrOriginal).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Use source as reference: On'),
      '16:9',
      undefined,
      'make it neon',
      expect.stringContaining('Reference Continuity'),
    )
    expect(generateVideo).toHaveBeenCalledWith(
      'bytedance/doubao-seedance-2.0',
      expect.stringContaining('original video motion prompt'),
      { aspect: '16:9', duration: 8 },
    )
  })

  it('uses text-to-image generation for image output when reference is off', async () => {
    setCanvas(branchEdge({ useSourceAsReference: false, model: 'openai/custom-image' }))

    await runBranchGeneration('project-1', 'edge-1')

    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(generateImage).toHaveBeenCalledWith(
      'openai/custom-image',
      expect.stringContaining('make it neon'),
      '1024x1024',
      1,
    )
    expect(editImages).not.toHaveBeenCalled()
  })

  it.each(['openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'])(
    'keeps selected %s for source-reference edits and records it on the card',
    async (model) => {
      setCanvas(branchEdge({ model }))
      const sketch = new Blob(['sketch'], { type: 'image/png' })
      await runBranchGeneration('project-1', 'edge-1', [{ blob: sketch, kind: 'sketch' }])
      expect(editImages).toHaveBeenCalledWith(
        [expect.any(Blob), sketch],
        expect.stringContaining('Sketch references (images 2)'),
        { model, n: 1, size: '1024x1024' },
      )
      expect(vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0][3]).toContain(
        'Sketch references (images 2)',
      )
      expect(useCanvas.getState().cards.find((card) => card.id === 'target-1')?.model).toBe(model)
    },
  )

  it('uses uploaded attachments even when source reference is disabled', async () => {
    setCanvas(branchEdge({ useSourceAsReference: false, model: 'openai/gpt-image-2.5-flare' }))
    const attachment = new Blob(['upload'], { type: 'image/png' })
    await runBranchGeneration('project-1', 'edge-1', [{ blob: attachment }])
    expect(blobForCard).not.toHaveBeenCalled()
    expect(editImages).toHaveBeenCalledWith(
      [attachment],
      expect.any(String),
      expect.objectContaining({ model: 'openai/gpt-image-2.5-flare' }),
    )
    expect(generateImage).not.toHaveBeenCalled()
  })

  it('includes branch attachments in video reference input', async () => {
    setCanvas(branchEdge({ outputMode: 'video', useSourceAsReference: false }), {
      ...targetImage,
      type: 'video',
    })
    const attachment = new Blob(['upload'], { type: 'image/png' })
    await runBranchGeneration('project-1', 'edge-1', [{ blob: attachment, kind: 'sketch' }])
    expect(mergeRefsForVideo).toHaveBeenCalledWith([attachment], '16:9')
    expect(generateVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Sketch'),
      expect.objectContaining({ image: expect.any(Object) }),
    )
  })

  it('builds a Chinese branch brief from Settings language', () => {
    useSettings.setState({ lang: 'zh' })

    const brief = buildBranchBrief({
      source: sourceImage,
      edge: branchEdge(),
      language: useSettings.getState().lang,
    })

    expect(brief).toContain('请使用中文')
    expect(brief).toContain('当前日期')
    expect(brief).toContain(String(new Date().getFullYear()))
    expect(brief).toContain('不要生成过去年份')
    expect(brief).toContain('源卡片提示词')
    expect(brief).toContain('分支修改')
  })

  it('builds a video branch brief with Human Scene constraints', () => {
    const brief = buildBranchBrief({
      source: sourceImage,
      edge: branchEdge({
        outputMode: 'video',
        humanSceneId: 'scene-1',
        useHumanSceneReference: false,
      }),
      humanSceneTextConstraint: 'Human scene constraints\nExactly 2 people',
      language: 'en',
    })

    expect(brief).toContain('Branch human scene constraints')
    expect(brief).toContain('Human scene constraints')
    expect(brief).toContain('Exactly 2 people')
    expect(brief.indexOf('Branch modification')).toBeLessThan(
      brief.indexOf('Branch human scene constraints'),
    )
    expect(brief.indexOf('Branch human scene constraints')).toBeLessThan(
      brief.indexOf('Source card prompt'),
    )
  })

  it('adds Human Scene text to video optimizer and knowledge without sketch merge when reference is off', async () => {
    useCanvas.setState({
      cards: [sourceImage, { ...targetImage, type: 'video', w: 400, h: 240 }],
      edges: [
        branchEdge({
          outputMode: 'video',
          useSourceAsReference: false,
          humanSceneId: 'scene-1',
          useHumanSceneReference: false,
        }),
      ],
      humanScenes: [humanScene],
      viewports: {},
    })

    await runBranchGeneration('project-1', 'edge-1')

    const optimizerCall = vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0]
    expect(String(optimizerCall[1])).toContain('Human scene constraints')
    expect(String(optimizerCall[5])).toContain('Human scene constraints')
    expect(mergeRefsForVideo).not.toHaveBeenCalled()
    expect(generateVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Human scene constraints'),
      { aspect: '16:9', duration: 8 },
    )
  })

  it('merges source image reference and Human Scene sketch reference for video output', async () => {
    useCanvas.setState({
      cards: [sourceImage, { ...targetImage, type: 'video', w: 400, h: 240 }],
      edges: [
        branchEdge({
          outputMode: 'video',
          useSourceAsReference: true,
          humanSceneId: 'scene-1',
          useHumanSceneReference: true,
        }),
      ],
      humanScenes: [humanScene],
      viewports: {},
    })

    await runBranchGeneration('project-1', 'edge-1')

    expect(blobForCard).toHaveBeenCalledTimes(1)
    expect(mergeRefsForVideo).toHaveBeenCalledWith([expect.any(Blob), expect.any(Blob)], '16:9')
    expect(generateVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Human scene constraints'),
      {
        image: { base64: 'merged-reference-base64', mimeType: 'image/jpeg' },
        aspect: '16:9',
        duration: 8,
      },
    )
  })

  it('uses Human Scene sketch reference as the only video image payload when no source reference is used', async () => {
    useCanvas.setState({
      cards: [sourceImage, { ...targetImage, type: 'video', w: 400, h: 240 }],
      edges: [
        branchEdge({
          outputMode: 'video',
          useSourceAsReference: false,
          humanSceneId: 'scene-1',
          useHumanSceneReference: true,
        }),
      ],
      humanScenes: [humanScene],
      viewports: {},
    })

    await runBranchGeneration('project-1', 'edge-1')

    expect(blobForCard).not.toHaveBeenCalled()
    expect(mergeRefsForVideo).toHaveBeenCalledWith([expect.any(Blob)], '16:9')
    expect(generateVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Human scene constraints'),
      {
        image: { base64: 'merged-reference-base64', mimeType: 'image/jpeg' },
        aspect: '16:9',
        duration: 8,
      },
    )
  })

  it('does not inject Human Scene constraints when the scene belongs to another project', async () => {
    useCanvas.setState({
      cards: [sourceImage, { ...targetImage, type: 'video', w: 400, h: 240 }],
      edges: [
        branchEdge({
          outputMode: 'video',
          useSourceAsReference: false,
          humanSceneId: 'scene-1',
          useHumanSceneReference: true,
        }),
      ],
      humanScenes: [{ ...humanScene, projectId: 'project-2' }],
      viewports: {},
    })

    await runBranchGeneration('project-1', 'edge-1')

    const optimizerCall = vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0]
    expect(String(optimizerCall[1])).not.toContain('Human scene constraints')
    expect(String(optimizerCall[5])).not.toContain('Human scene constraints')
    expect(mergeRefsForVideo).not.toHaveBeenCalled()
  })

  it('ignores Human Scene fields for image output branches', async () => {
    useCanvas.setState({
      cards: [sourceImage, targetImage],
      edges: [
        branchEdge({
          outputMode: 'image',
          useSourceAsReference: false,
          humanSceneId: 'scene-1',
          useHumanSceneReference: true,
          model: 'openai/custom-image',
        }),
      ],
      humanScenes: [humanScene],
      viewports: {},
    })

    await runBranchGeneration('project-1', 'edge-1')

    const optimizerCall = vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0]
    expect(String(optimizerCall[1])).not.toContain('Human scene constraints')
    expect(generateImage).toHaveBeenCalledWith(
      'openai/custom-image',
      expect.not.stringContaining('Human scene constraints'),
      '1024x1024',
      1,
    )
    expect(mergeRefsForVideo).not.toHaveBeenCalled()
    expect(blobForCard).not.toHaveBeenCalled()
  })

  it('marks target card and edge failed when generation fails', async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error('provider unavailable'))
    setCanvas(branchEdge({ useSourceAsReference: false }))

    await runBranchGeneration('project-1', 'edge-1')

    expect(useCanvas.getState().cards.find((card) => card.id === 'target-1')).toMatchObject({
      status: 'failed',
      error: 'provider unavailable',
    })
    expect(useCanvas.getState().edges[0]).toMatchObject({
      status: 'failed',
      error: 'provider unavailable',
    })
  })

  it('does not fail a wrong-project target card during preflight target validation', async () => {
    const wrongProjectTarget: Card = {
      ...targetImage,
      id: 'target-project-2',
      projectId: 'project-2',
      status: 'generating',
      error: undefined,
    }
    useCanvas.setState({
      cards: [sourceImage, wrongProjectTarget],
      edges: [branchEdge({ targetCardId: 'target-project-2' })],
      humanScenes: [],
      viewports: {},
    })

    await runBranchGeneration('project-1', 'edge-1')

    expect(useCanvas.getState().cards.find((card) => card.id === 'target-project-2')).toMatchObject(
      {
        projectId: 'project-2',
        status: 'generating',
        error: undefined,
      },
    )
    expect(useCanvas.getState().edges.find((edge) => edge.id === 'edge-1')).toMatchObject({
      projectId: 'project-1',
      status: 'failed',
      error: 'Branch target card is missing.',
    })
  })

  it('does not mark an edge ready when the target card was deleted during generation', async () => {
    const edit = deferred<string[]>()
    vi.mocked(editImages).mockReturnValueOnce(edit.promise)

    const generation = runBranchGeneration('project-1', 'edge-1')
    await vi.waitFor(() => expect(editImages).toHaveBeenCalledTimes(1))

    useCanvas.getState().removeCard('target-1')
    edit.resolve(['data:image/png;base64,late'])
    await generation

    expect(useCanvas.getState().cards.some((card) => card.id === 'target-1')).toBe(false)
    expect(useCanvas.getState().edges[0]).toMatchObject({
      targetCardId: undefined,
      status: 'draft',
    })
  })

  it('does not apply an old completion after the edge target changes to a replacement card', async () => {
    const edit = deferred<string[]>()
    vi.mocked(editImages).mockReturnValueOnce(edit.promise)
    const replacement: Card = {
      ...targetImage,
      id: 'target-2',
      status: 'generating',
      url: undefined,
      assetId: undefined,
    }

    const generation = runBranchGeneration('project-1', 'edge-1')
    await vi.waitFor(() => expect(editImages).toHaveBeenCalledTimes(1))

    useCanvas.setState((state) => ({ cards: [...state.cards, replacement] }))
    useCanvas.getState().updateEdge('edge-1', { targetCardId: 'target-2', status: 'generating' })
    edit.resolve(['data:image/png;base64,late'])
    await generation

    const oldTarget = useCanvas.getState().cards.find((card) => card.id === 'target-1')
    expect(oldTarget).toMatchObject({ status: 'generating' })
    expect(oldTarget?.url).toBeUndefined()
    expect(oldTarget?.assetId).toBeUndefined()

    const newTarget = useCanvas.getState().cards.find((card) => card.id === 'target-2')
    expect(newTarget).toMatchObject({ status: 'generating' })
    expect(newTarget?.url).toBeUndefined()
    expect(newTarget?.assetId).toBeUndefined()
    expect(useCanvas.getState().edges[0]).toMatchObject({
      targetCardId: 'target-2',
      status: 'generating',
    })
  })
})
