import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat } from '../store/chatStore'
import { runGeneration } from './generate'
import { optimizePromptForGenerationOrOriginal, runAgent } from './agent'
import { referenceToImage, referenceToVideo, textToImage, textToVideo } from './edits'
import { useSettings } from '../store/settingsStore'
import { useCanvas } from '../store/canvasStore'
import { createDefaultHumanScene } from './humanScene'

vi.mock('./agent', () => ({
  optimizePromptForGenerationOrOriginal: vi.fn(
    async (_projectId: string, prompt: string) => prompt,
  ),
  runAgent: vi.fn(async () => undefined),
}))

vi.mock('./edits', () => ({
  referenceToImage: vi.fn(async () => undefined),
  referenceToVideo: vi.fn(async () => undefined),
  textToImage: vi.fn(async () => undefined),
  textToVideo: vi.fn(async () => undefined),
}))

const labels = {
  genDone: 'Generated',
  genFailed: 'Generation failed',
  reference: 'Reference',
  image: 'Image',
  video: 'Video',
}

describe('runGeneration open design routing', () => {
  it.each(['openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'])(
    'forwards the selected image model %s with and without references',
    async (model) => {
      const req = {
        text: 'A product photo',
        mode: 'image' as const,
        aspect: '16:9' as const,
        styleSlug: null,
        labels,
        model,
      }
      const image = new Blob(['reference'], { type: 'image/png' })
      await runGeneration('project-1', { ...req, refBlobs: [image] })
      expect(referenceToImage).toHaveBeenCalledWith(
        'project-1',
        expect.any(String),
        [image],
        1,
        model,
      )
      await runGeneration('project-1', { ...req, refBlobs: [] })
      expect(vi.mocked(runAgent).mock.calls[0][6]).toBe(model)
    },
  )
  it('passes the sketch image and its role through optimization and image editing', async () => {
    const sketch = new Blob(['sketch'], { type: 'image/png' })
    await runGeneration('project-1', {
      text: 'A finished product photo',
      mode: 'image',
      aspect: '16:9',
      styleSlug: null,
      refBlobs: [sketch],
      sketchReferenceIndices: [0],
      labels,
    })
    expect(String(vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0][3])).toContain(
      'Sketch references (images 1)',
    )
    expect(referenceToImage).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Sketch references (images 1)'),
      [sketch],
    )
  })
  it('keeps explicit video controls when a design system is selected without references', async () => {
    await runGeneration('project-1', {
      text: 'Long cinematic shot',
      mode: 'video',
      aspect: '16:9',
      videoAspect: '21:9',
      duration: 30,
      resolution: '720p',
      generateAudio: false,
      videoMode: 'firstLastFrame',
      model: 'bytedance/doubao-seedance-2.5',
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'notion',
      labels,
    })
    expect(runAgent).not.toHaveBeenCalled()
    expect(textToVideo).toHaveBeenCalledWith('project-1', expect.any(String), '21:9', 30, {
      resolution: '720p',
      generateAudio: false,
      videoMode: 'firstLastFrame',
      model: 'bytedance/doubao-seedance-2.5',
    })
  })
  beforeEach(() => {
    vi.clearAllMocks()
    useSettings.setState({ lang: 'en' })
    useChat.setState({ messages: [], plans: [], busy: {} })
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  })

  it('routes selected image templates through the agent with the expanded prompt', async () => {
    await runGeneration('project-1', {
      text: 'Roadmap dashboard for a design team',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'notion',
      openDesignTemplateId: 'notion-team-dashboard-live-artifact',
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(runAgent).mock.calls[0][1])).toContain('Notion-style Team Dashboard')
    expect(String(vi.mocked(runAgent).mock.calls[0][1])).toContain(
      'Roadmap dashboard for a design team',
    )
    expect(vi.mocked(runAgent).mock.calls[0][4]).toBe('Roadmap dashboard for a design team')
    expect(textToImage).not.toHaveBeenCalled()
  })

  it('records failures only as failures for direct reference generation', async () => {
    vi.mocked(referenceToImage).mockRejectedValueOnce(new Error('provider unavailable'))

    await runGeneration('project-1', {
      text: 'Roadmap dashboard for a design team',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [new Blob(['reference'], { type: 'image/png' })],
      openDesignSystemId: 'notion',
      openDesignTemplateId: 'notion-team-dashboard-live-artifact',
      labels,
    })

    const contents = useChat.getState().messages.map((message) => message.content)
    expect(optimizePromptForGenerationOrOriginal).toHaveBeenCalledTimes(1)
    expect(contents.join('\n')).toContain('Generation failed: Image — provider unavailable')
    expect(contents.join('\n')).not.toContain('Generated: Image')
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('records failures only as failures for direct reference video generation', async () => {
    vi.mocked(referenceToVideo).mockRejectedValueOnce(new Error('reference merge failed'))

    await runGeneration('project-1', {
      text: 'Premium smartwatch launch',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [new Blob(['reference'], { type: 'image/svg+xml' })],
      openDesignSystemId: null,
      openDesignTemplateId: 'hyperframes-product-reveal-minimal',
      labels,
    })

    const contents = useChat
      .getState()
      .messages.map((message) => message.content)
      .join('\n')
    expect(referenceToVideo).toHaveBeenCalledTimes(1)
    expect(contents).toContain('Generation failed: Video — reference merge failed')
    expect(contents).not.toContain('Generated: Video')
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('uses visible Open Design prompts without wrapping them again', async () => {
    const visiblePrompt = [
      'Open Design template: Notion-style Team Dashboard',
      'User brief: Roadmap dashboard for a design team',
      'Target aspect ratio: 16:9',
      'Template prompt: Create a Notion-native team dashboard mockup for Roadmap dashboard for a design team.',
    ].join('\n')

    await runGeneration('project-1', {
      text: visiblePrompt,
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'notion',
      openDesignTemplateId: 'notion-team-dashboard-live-artifact',
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runAgent).mock.calls[0][1]).toBe(visiblePrompt)
    expect(vi.mocked(runAgent).mock.calls[0][4]).toBe(visiblePrompt)
    expect(textToImage).not.toHaveBeenCalled()
  })

  it('routes selected YouMind image templates through the agent with the expanded prompt', async () => {
    await runGeneration('project-1', {
      text: 'Modular desk lamp for software teams',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: null,
      openDesignTemplateId: null,
      youMindCategoryId: null,
      youMindTemplateId: 'youmind-product-marketing-launch-poster',
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    const prompt = String(vi.mocked(runAgent).mock.calls[0][1])
    expect(prompt).toContain('YouMind GPT Image 2 template: Product Marketing Launch Poster')
    expect(prompt).toContain('Modular desk lamp for software teams')
    expect(prompt).toContain('Target aspect ratio: 16:9')
    expect(vi.mocked(runAgent).mock.calls[0][4]).toBe('Modular desk lamp for software teams')
    expect(textToImage).not.toHaveBeenCalled()
  })

  it('routes selected video templates through the agent with the expanded prompt', async () => {
    await runGeneration('project-1', {
      text: 'Premium smartwatch launch',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: null,
      openDesignTemplateId: 'hyperframes-product-reveal-minimal',
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(runAgent).mock.calls[0][1])).toContain('Minimal Product Reveal')
    expect(vi.mocked(runAgent).mock.calls[0][2]).toBe('16:9')
    expect(textToVideo).not.toHaveBeenCalled()
  })

  it('localizes selected template prompts from the current UI language', async () => {
    useSettings.setState({ lang: 'zh' })

    await runGeneration('project-1', {
      text: '产品团队路线图',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'notion',
      openDesignTemplateId: 'notion-team-dashboard-live-artifact',
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    const prompt = String(vi.mocked(runAgent).mock.calls[0][1])
    expect(prompt).toContain('Open Design 模板: Notion 风格团队仪表盘')
    expect(prompt).toContain('模板提示词: 为 产品团队路线图 创建')
    expect(prompt).toContain('设计系统规则: 带有空白画布感的温暖极简')
  })

  it('preserves all selected refs for video template generation', async () => {
    const refs = [
      new Blob(['reference 1'], { type: 'image/png' }),
      new Blob(['reference 2'], { type: 'image/png' }),
    ]
    vi.mocked(optimizePromptForGenerationOrOriginal).mockResolvedValueOnce('optimized video prompt')

    await runGeneration('project-1', {
      text: 'Premium smartwatch launch',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: refs,
      openDesignSystemId: null,
      openDesignTemplateId: 'hyperframes-product-reveal-minimal',
      labels,
    })

    expect(referenceToVideo).toHaveBeenCalledTimes(1)
    expect(vi.mocked(referenceToVideo).mock.calls[0][1]).toContain('optimized video prompt')
    expect(vi.mocked(referenceToVideo).mock.calls[0][1]).toContain(
      'Use the attached reference image(s) as the primary visual source',
    )
    expect(vi.mocked(referenceToVideo).mock.calls[0][2]).toBe(refs)
    expect(vi.mocked(referenceToVideo).mock.calls[0][3]).toBe('16:9')
    expect(vi.mocked(referenceToVideo).mock.calls[0][4]).toBe(5)
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('anchors direct reference video prompts to the attached refs before context or optimization', async () => {
    useSettings.setState({ lang: 'en' })
    vi.mocked(optimizePromptForGenerationOrOriginal).mockImplementationOnce(
      async (_projectId: string, prompt: string) => prompt,
    )

    const refs = [new Blob(['grape reference'], { type: 'image/png' })]
    await runGeneration('project-1', {
      text: 'Animate this as a premium product shot',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: refs,
      openDesignSystemId: 'linear-app',
      openDesignTemplateId: null,
      labels,
    })

    const promptSentToOptimizer = String(
      vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0][1],
    )
    expect(promptSentToOptimizer).toContain(
      'Use the attached reference image(s) as the primary visual source',
    )
    expect(promptSentToOptimizer).toContain('Do not replace the referenced subject')
    expect(promptSentToOptimizer).toContain('Open Design design system: Linear')
    expect(vi.mocked(referenceToVideo).mock.calls[0][1]).toBe(promptSentToOptimizer)
  })

  it('routes design-system-only prompts through the agent with context', async () => {
    await runGeneration('project-1', {
      text: 'Create three product onboarding screens',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'linear-app',
      openDesignTemplateId: null,
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runAgent).mock.calls[0][0]).toBe('project-1')
    expect(vi.mocked(runAgent).mock.calls[0][1]).toBe('Create three product onboarding screens')
    expect(vi.mocked(runAgent).mock.calls[0][2]).toBe('16:9')
    expect(String(vi.mocked(runAgent).mock.calls[0][3])).toContain(
      'Open Design design system: Linear',
    )
  })

  it('routes selected YouMind categories through the agent with guidance', async () => {
    await runGeneration('project-1', {
      text: 'Create a launch poster for a tiny espresso machine',
      mode: 'image',
      aspect: '9:16',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: null,
      openDesignTemplateId: null,
      youMindCategoryId: 'poster-flyer',
      youMindTemplateId: null,
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runAgent).mock.calls[0][0]).toBe('project-1')
    expect(vi.mocked(runAgent).mock.calls[0][1]).toBe(
      'Create a launch poster for a tiny espresso machine',
    )
    expect(String(vi.mocked(runAgent).mock.calls[0][3])).toContain(
      'YouMind GPT Image 2 source: Poster / Flyer',
    )
    expect(textToImage).not.toHaveBeenCalled()
  })

  it('reports missing YouMind templates without calling generation', async () => {
    await runGeneration('project-1', {
      text: 'Missing template test',
      mode: 'image',
      aspect: '1:1',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: null,
      openDesignTemplateId: null,
      youMindCategoryId: null,
      youMindTemplateId: 'missing-youmind-template',
      labels,
    })

    expect(textToImage).not.toHaveBeenCalled()
    expect(runAgent).not.toHaveBeenCalled()
    const messages = useChat.getState().messages
    expect(messages[messages.length - 1]?.content).toBe(
      '⚠️ YouMind template not found: missing-youmind-template',
    )
  })

  it('routes design-system-only video prompts through the creative agent', async () => {
    await runGeneration('project-1', {
      text: 'Create a calm product walkthrough video',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'linear-app',
      openDesignTemplateId: null,
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runAgent).mock.calls[0][0]).toBe('project-1')
    expect(vi.mocked(runAgent).mock.calls[0][1]).toBe('Create a calm product walkthrough video')
    expect(String(vi.mocked(runAgent).mock.calls[0][3])).toContain(
      'Open Design design system: Linear',
    )
    expect(textToVideo).not.toHaveBeenCalled()
  })

  it('localizes design-system-only agent context from the current UI language', async () => {
    useSettings.setState({ lang: 'zh' })

    await runGeneration('project-1', {
      text: '创建三个产品 onboarding 屏幕',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'linear-app',
      openDesignTemplateId: null,
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(runAgent).mock.calls[0][3])).toContain('Open Design 设计系统: Linear')
    expect(String(vi.mocked(runAgent).mock.calls[0][3])).toContain('原生深色模式')
  })
})

describe('runGeneration video knowledge routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettings.setState({ lang: 'en' })
    useChat.setState({ messages: [], plans: [], busy: {} })
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  })

  it('passes book-derived video knowledge to reference-to-video direct optimization', async () => {
    const refs = [new Blob(['reference'], { type: 'image/png' })]

    await runGeneration('project-1', {
      text: 'Animate this with a slow push-in camera move',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: refs,
      labels,
    })

    const optimizerCall = vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0]
    expect(String(optimizerCall[1])).toContain(
      'Use the attached reference image(s) as the primary visual source',
    )
    expect(String(optimizerCall[5])).toContain('General World Model director guide')
    expect(String(optimizerCall[5])).toContain('Reference Continuity')
    expect(referenceToVideo).toHaveBeenCalledTimes(1)
  })

  it('passes book-derived video knowledge to video Agent routes', async () => {
    await runGeneration('project-1', {
      text: 'Create a cinematic launch video with warm light',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'linear-app',
      openDesignTemplateId: null,
      labels,
    })

    const agentCall = vi.mocked(runAgent).mock.calls[0]
    expect(String(agentCall[3])).toContain('Open Design design system: Linear')
    expect(String(agentCall[5])).toContain('General World Model director guide')
    expect(String(agentCall[5])).toContain('Lighting and Material Behavior')
  })

  it('does not pass video knowledge to image generation by default', async () => {
    await runGeneration('project-1', {
      text: 'Create a cinematic launch poster with warm light',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      labels,
    })

    const agentCall = vi.mocked(runAgent).mock.calls[0]
    expect(agentCall[5]).toBeUndefined()
  })

  it('ignores stale YouMind category context for video generation', async () => {
    await runGeneration('project-1', {
      text: 'Create a cinematic launch video with warm light',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'linear-app',
      openDesignTemplateId: null,
      youMindCategoryId: 'poster-flyer',
      youMindTemplateId: null,
      labels,
    })

    const agentCall = vi.mocked(runAgent).mock.calls[0]
    expect(String(agentCall[3])).toContain('Open Design design system: Linear')
    expect(String(agentCall[3])).not.toContain('YouMind GPT Image 2')
    expect(String(agentCall[5])).toContain('General World Model director guide')
  })

  it('ignores stale YouMind image templates for video generation', async () => {
    await runGeneration('project-1', {
      text: 'Create a cinematic launch video with warm light',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      openDesignSystemId: 'linear-app',
      openDesignTemplateId: null,
      youMindCategoryId: null,
      youMindTemplateId: 'youmind-product-marketing-launch-poster',
      labels,
    })

    const agentCall = vi.mocked(runAgent).mock.calls[0]
    expect(agentCall[1]).toBe('Create a cinematic launch video with warm light')
    expect(String(agentCall[1])).not.toContain('YouMind GPT Image 2 template')
    expect(String(agentCall[5])).toContain('General World Model director guide')
  })
})

describe('runGeneration human scene video guidance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettings.setState({ lang: 'en' })
    useChat.setState({ messages: [], plans: [], busy: {} })
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  })

  it('injects Human Scene constraints into direct video generation without sketch references', async () => {
    const sceneId = useCanvas.getState().addHumanScene({
      ...createDefaultHumanScene('project-1', 'Lobby blocking', '16:9'),
      projectId: 'project-1',
    })

    await runGeneration('project-1', {
      text: 'Create a lobby walkthrough',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      humanSceneId: sceneId,
      useHumanSceneReference: false,
      labels,
    })

    expect(textToVideo).toHaveBeenCalledTimes(1)
    expect(referenceToVideo).not.toHaveBeenCalled()
    expect(runAgent).not.toHaveBeenCalled()
    expect(String(vi.mocked(textToVideo).mock.calls[0][1])).toContain('Human scene constraints')
    expect(String(vi.mocked(textToVideo).mock.calls[0][1])).toContain('Scene: Lobby blocking')
    expect(String(vi.mocked(textToVideo).mock.calls[0][1])).toContain('Exactly 1 person')
    expect(String(vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0][3])).toContain(
      'Human scene constraints',
    )
  })

  it('adds a Human Scene sketch Blob and routes video generation through reference-to-video', async () => {
    const sceneId = useCanvas.getState().addHumanScene({
      ...createDefaultHumanScene('project-1', 'Lobby blocking', '16:9'),
      projectId: 'project-1',
    })

    await runGeneration('project-1', {
      text: 'Create a lobby walkthrough',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      humanSceneId: sceneId,
      useHumanSceneReference: true,
      labels,
    })

    expect(referenceToVideo).toHaveBeenCalledTimes(1)
    expect(textToVideo).not.toHaveBeenCalled()
    expect(vi.mocked(referenceToVideo).mock.calls[0][2]).toHaveLength(1)
    expect(vi.mocked(referenceToVideo).mock.calls[0][2][0].type).toBe('image/svg+xml')
    const generationPrompt = String(vi.mocked(referenceToVideo).mock.calls[0][1])
    const optimizerPrompt = String(
      vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0][1],
    )
    expect(generationPrompt).toContain('Human scene constraints')
    expect(generationPrompt).toContain('Human scene sketch reference constraint')
    expect(generationPrompt).toContain('control only')
    expect(generationPrompt).not.toContain('primary visual source')
    expect(generationPrompt).not.toContain('referenced subject identity')
    expect(optimizerPrompt).toContain('Human scene sketch reference constraint')
    expect(optimizerPrompt).not.toContain('primary visual source')
    expect(String(vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0][5])).toContain(
      'Reference Continuity',
    )
  })

  it('keeps normal reference identity guidance when user refs are combined with a Human Scene sketch', async () => {
    const sceneId = useCanvas.getState().addHumanScene({
      ...createDefaultHumanScene('project-1', 'Lobby blocking', '16:9'),
      projectId: 'project-1',
    })
    const refs = [new Blob(['product reference'], { type: 'image/png' })]

    await runGeneration('project-1', {
      text: 'Create a lobby walkthrough',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: refs,
      humanSceneId: sceneId,
      useHumanSceneReference: true,
      labels,
    })

    const generationPrompt = String(vi.mocked(referenceToVideo).mock.calls[0][1])
    expect(vi.mocked(referenceToVideo).mock.calls[0][2]).toHaveLength(2)
    expect(generationPrompt).toContain('Reference constraint: 1 reference image(s) are attached.')
    expect(generationPrompt).toContain('primary visual source')
    expect(generationPrompt).toContain('Human scene sketch reference constraint')
  })

  it('ignores Human Scene fields for image generation by default', async () => {
    const sceneId = useCanvas.getState().addHumanScene({
      ...createDefaultHumanScene('project-1', 'Lobby blocking', '16:9'),
      projectId: 'project-1',
    })

    await runGeneration('project-1', {
      text: 'Create a lobby poster',
      mode: 'image',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      humanSceneId: sceneId,
      useHumanSceneReference: true,
      labels,
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runAgent).mock.calls[0][1]).toBe('Create a lobby poster')
    expect(vi.mocked(runAgent).mock.calls[0][3]).toBeUndefined()
    expect(vi.mocked(runAgent).mock.calls[0][5]).toBeUndefined()
    expect(referenceToImage).not.toHaveBeenCalled()
    expect(textToImage).not.toHaveBeenCalled()
  })

  it('ignores a Human Scene id from another project', async () => {
    const sceneId = useCanvas.getState().addHumanScene({
      ...createDefaultHumanScene('project-1', 'Lobby blocking', '16:9'),
      projectId: 'project-1',
    })

    await runGeneration('project-2', {
      text: 'Create a lobby walkthrough',
      mode: 'video',
      aspect: '16:9',
      duration: 5,
      styleSlug: null,
      refBlobs: [],
      humanSceneId: sceneId,
      useHumanSceneReference: true,
      labels,
    })

    expect(textToVideo).toHaveBeenCalledTimes(1)
    expect(referenceToVideo).not.toHaveBeenCalled()
    expect(String(vi.mocked(textToVideo).mock.calls[0][1])).not.toContain('Human scene constraints')
    expect(vi.mocked(optimizePromptForGenerationOrOriginal).mock.calls[0][3]).toBeUndefined()
  })
})
