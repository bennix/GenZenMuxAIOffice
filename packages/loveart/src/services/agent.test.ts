import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvas } from '../store/canvasStore'
import { useChat } from '../store/chatStore'
import { buildAgentSystemMessages, optimizePromptForGenerationOrOriginal, runAgent } from './agent'
import { chatCompletion, generateImage } from './zenmux'
import { useSettings } from '../store/settingsStore'

vi.mock('./zenmux', () => ({
  chatCompletion: vi.fn(),
  generateImage: vi.fn(async () => ['data:image/png;base64,test']),
  generateVideo: vi.fn(async () => 'data:video/mp4;base64,test'),
}))

const fullAgentReviews = [
  'Intent Agent',
  'Prompt Strategist',
  'Art Director',
  'Critic Agent',
  'Safety & Brand Guard',
  'Production Agent',
].map((agent) => ({
  agent,
  finding: `${agent} finding`,
  improvement: `${agent} improvement`,
}))

describe('buildAgentSystemMessages', () => {
  it('includes aspect and open design context as internal system messages', () => {
    const messages = buildAgentSystemMessages('16:9', 'Open Design design system: Linear', 'en')

    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('ArtFlow')
    expect(messages[0].content).toContain('present_prompt_optimization')
    expect(messages[0].content).toContain('Critic Agent')
    expect(messages.map((message) => message.content).join('\n')).toContain(
      'Target aspect ratio for generated images: 16:9.',
    )
    expect(messages.map((message) => message.content).join('\n')).toContain(
      'Open Design design system: Linear',
    )
  })

  it('omits optional messages when no optional context is passed', () => {
    const messages = buildAgentSystemMessages(undefined, undefined, 'en')

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toContain('AI design agent operating on an infinite canvas')
  })

  it('can request Chinese-facing agent behavior', () => {
    const messages = buildAgentSystemMessages('16:9', undefined, 'zh')

    expect(messages[0].content).toContain('请使用中文')
    expect(messages.map((message) => message.content).join('\n')).toContain(
      '生成图像的目标比例: 16:9。',
    )
  })
})

describe('runAgent prompt optimization gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useChat.setState({ messages: [], plans: [], busy: {} })
    useCanvas.setState({ cards: [], viewports: {} })
    useSettings.setState({ lang: 'en' })
  })

  it('generates when the model sends generation in the same turn as optimization', async () => {
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'opt-1',
              type: 'function',
              function: {
                name: 'present_prompt_optimization',
                arguments: JSON.stringify({
                  userIntent: 'Create a stronger poster.',
                  strategySteps: ['Clarify subject', 'Tighten composition'],
                  agentReviews: fullAgentReviews,
                  intermediatePrompt: 'draft prompt',
                  finalPrompt: 'final optimized prompt',
                }),
              },
            },
            {
              id: 'gen-1',
              type: 'function',
              function: {
                name: 'generate_image',
                arguments: JSON.stringify({ prompt: 'final optimized prompt', n: 1 }),
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        message: { role: 'assistant', content: 'Optimization shown.' },
      })

    await runAgent('project-1', 'raw prompt', '16:9')

    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(useCanvas.getState().cards).toHaveLength(1)
    expect(useCanvas.getState().cards[0]).toMatchObject({
      type: 'image',
      status: 'ready',
      prompt: 'final optimized prompt',
    })
    expect(
      useChat.getState().messages.some((message) => message.metadata?.promptOptimization),
    ).toBe(true)
  })

  it('keeps prior session dialogue as context while prioritizing the current request', async () => {
    useChat
      .getState()
      .addMessage('project-1', 'user', 'Earlier direction: make a perfume launch video.')
    useChat
      .getState()
      .addMessage('project-1', 'assistant', 'I will use premium glass bottle styling.')
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'Ready for current request.' },
    })

    await runAgent('project-1', 'Current request: animate the grape reference image.', '16:9')

    const history = vi.mocked(chatCompletion).mock.calls[0][1]
    const joined = history.map((message) => message.content).join('\n')
    expect(joined).toContain('Earlier direction: make a perfume launch video.')
    expect(joined).toContain('Current request: animate the grape reference image.')
    expect(joined).toContain('Current user request has highest priority')
    expect(joined).toContain(
      'Conversation history is context, not a replacement for the current request',
    )
  })

  it('adds orchestration metadata before running the model', async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'done' } as any,
    })

    await runAgent('project-1', 'Create a launch poster', '16:9')

    const orchestration = useChat
      .getState()
      .messagesFor('project-1')
      .find((message) => message.metadata?.orchestration)

    expect(orchestration?.metadata?.orchestration?.stages.map((stage) => stage.id)).toEqual([
      'baseline_scope',
      'eval_suite',
      'root_cause_analysis',
      'strategy_skills',
      'regression',
    ])
  })
})

describe('optimizePromptForGenerationOrOriginal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useChat.setState({ messages: [], plans: [], busy: {} })
    useSettings.setState({ lang: 'zh' })
  })

  it('uses a plain text optimizer response as the optimized prompt instead of falling back to the raw prompt', async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: '最终优化提示词：一张高端咖啡机发布海报，暖白背景，短标题，产品居中，柔和棚拍光。',
      },
    })

    const prompt = await optimizePromptForGenerationOrOriginal(
      'project-1',
      '咖啡机海报',
      '1:1',
      undefined,
      '咖啡机海报',
    )

    expect(prompt).toContain('高端咖啡机发布海报')
    expect(prompt).not.toBe('咖啡机海报')
    const messages = useChat.getState().messages
    expect(messages[messages.length - 1]?.metadata?.promptOptimization?.finalPrompt).toBe(prompt)
  })

  it('passes the selected language into the optimizer system prompt', async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      finishReason: 'stop',
      message: { role: 'assistant', content: '最终优化提示词：中文优化结果' },
    })

    await optimizePromptForGenerationOrOriginal('project-1', '原始提示词', '16:9')

    const history = vi.mocked(chatCompletion).mock.calls[0][1]
    expect(history[0].content).toContain('请使用中文')
    expect(history.map((message) => message.content).join('\n')).toContain(
      '生成图像或视频的目标比例: 16:9。',
    )
  })

  it('passes recent session context to direct prompt optimization without overriding the current prompt', async () => {
    useSettings.setState({ lang: 'en' })
    useChat
      .getState()
      .addMessage('project-1', 'user', 'Earlier direction: perfume bottle product launch.')
    useChat
      .getState()
      .addMessage('project-1', 'assistant', 'We used a glossy luxury fragrance style.')
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content:
          'Final optimized prompt: animate the grape cluster reference with cinematic macro motion.',
      },
    })

    await optimizePromptForGenerationOrOriginal(
      'project-1',
      'Reference constraint: use the grape image.\n\nUser request:\nanimate this reference',
      '16:9',
      undefined,
      'animate this reference',
    )

    const history = vi.mocked(chatCompletion).mock.calls[0][1]
    const joined = history.map((message) => message.content).join('\n')
    expect(joined).toContain('Earlier direction: perfume bottle product launch.')
    expect(joined).toContain('Current user request has highest priority')
    expect(joined).toContain('do not let prior conversation subjects replace the current subject')
  })
})

describe('video knowledge context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useChat.setState({ messages: [], plans: [], busy: {} })
    useCanvas.setState({ cards: [], viewports: {} })
    useSettings.setState({ lang: 'en' })
  })

  it('includes video knowledge in agent system messages when provided', () => {
    const messages = buildAgentSystemMessages(
      '16:9',
      'Open Design context',
      'en',
      'General World Model director guide:\n- Define temporal rhythm.',
    )

    const joined = messages.map((message) => message.content).join('\n')
    expect(joined).toContain('Open Design context')
    expect(joined).toContain('Book-derived video generation guidance')
    expect(joined).toContain('Define temporal rhythm')
  })

  it('passes video knowledge context into direct prompt optimization', async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'Final optimized prompt: a cinematic reference-to-video shot with clear rhythm.',
      },
    })

    await optimizePromptForGenerationOrOriginal(
      'project-1',
      'Animate this reference',
      '16:9',
      'Open Design context',
      'Animate this reference',
      'General World Model director guide:\n- Preserve reference identity.',
    )

    const history = vi.mocked(chatCompletion).mock.calls[0][1]
    const joined = history.map((message) => message.content).join('\n')
    expect(joined).toContain('Generation context:')
    expect(joined).toContain('Open Design context')
    expect(joined).toContain('Book-derived video generation guidance')
    expect(joined).toContain('Preserve reference identity')
    expect(joined).toContain('Current user request has highest priority')
  })
})
