// Agent orchestration loop — REQUIREMENTS.md §5.
// Drives the LLM via tool-calling; each generate_* tool creates a card immediately,
// then resolves it. Tool results are fed back to the LLM until the plan is complete.
import { chatCompletion, generateImage, generateVideo } from './zenmux'
import type { ChatMessage, ToolCall, ToolDef } from './zenmux'
import { storeMedia } from './assetStore'
import { useSettings, type Lang } from '../store/settingsStore'
import { useCanvas } from '../store/canvasStore'
import { useChat } from '../store/chatStore'
import type { PromptOptimizationMetadata } from '../types'
import { currentRuntimeDateContext } from './runtimeContext'
import { buildAgentOrchestration } from './agentOrchestration'

import { IMAGE_PROMPT_GUIDE } from './imagePromptGuidance'

const PROMPT_REVIEW_AGENTS = [
  {
    name: 'Intent Agent',
    focus: 'clarify the user outcome, audience, medium, and missing constraints',
  },
  {
    name: 'Prompt Strategist',
    focus: 'turn the request into a precise step-by-step generation strategy',
  },
  {
    name: 'Art Director',
    focus: 'sharpen composition, style, palette, typography, lighting, and material detail',
  },
  {
    name: 'Critic Agent',
    focus:
      'check instruction fidelity, exact text, reference roles, unintended changes, and failure modes',
  },
  {
    name: 'Safety & Brand Guard',
    focus:
      'preserve explicitly requested brand names and copy; flag unrequested logos, watermarks, unreadable text, and conflicting instructions',
  },
  {
    name: 'Production Agent',
    focus: 'merge the strongest fixes into the final prompt sent to the generator',
  },
] as const

const PROMPT_REVIEW_AGENT_TEXT = PROMPT_REVIEW_AGENTS.map(
  (agent) => `- ${agent.name}: ${agent.focus}.`,
).join('\n')

function languageInstruction(lang: Lang): string {
  return lang === 'zh'
    ? `请使用中文进行计划、提示词优化展示、最终回复，以及发给生成模型的最终提示词。\n${currentRuntimeDateContext(lang)}`
    : `Use English for the plan, prompt optimization display, final response, and final prompt sent to the generation model.\n${currentRuntimeDateContext(lang)}`
}

function currentTurnPriorityInstruction(lang: Lang): string {
  return lang === 'zh'
    ? [
        '当前用户请求拥有最高优先级。',
        '同一项目的对话历史是上下文，不是当前请求的替代品。',
        '可以继承历史中的明确偏好、约束、风格和已确认决策；不要让历史主题、产品、物体或品牌替换当前用户文本、参考图、当前模板或当前生成模式。',
        '如果历史与当前请求冲突，必须服从当前请求。',
      ].join('\n')
    : [
        'Current user request has highest priority.',
        'Conversation history is context, not a replacement for the current request.',
        'You may reuse explicit preferences, constraints, style choices, and confirmed decisions from history; do not let prior conversation subjects replace the current subject, attached references, selected template, or current generation mode.',
        'If history conflicts with the current request, follow the current request.',
      ].join('\n')
}

const SYSTEM_PROMPT = `You are ArtFlow, an AI design agent operating on an infinite canvas.
Given a creative request, FIRST call submit_plan with a short list of concrete steps.
Then run a visible multi-agent prompt optimization pass by calling present_prompt_optimization.
Use this internal Agent Council:
${PROMPT_REVIEW_AGENT_TEXT}
Show the optimization process through that tool before calling generation tools. The final
generation prompt must be based on the optimized prompt, not the raw user wording. Generate
multiple variations where helpful. Keep calling tools until the plan is complete, then write a
short final summary message to the user. Prefer images unless the user explicitly asks for video.

${IMAGE_PROMPT_GUIDE}`

const PROMPT_OPTIMIZATION_TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'present_prompt_optimization',
    description:
      'Show the user how the request was optimized before generation. Call this after submit_plan and before any generation tool.',
    parameters: {
      type: 'object',
      properties: {
        userIntent: { type: 'string', description: 'Concise read of what the user wants.' },
        strategySteps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Step-by-step optimization strategy.',
        },
        agentReviews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent: { type: 'string' },
              finding: { type: 'string' },
              improvement: { type: 'string' },
            },
            required: ['agent', 'finding', 'improvement'],
          },
          description:
            'One short critique and improvement from each Agent Council member: Intent Agent, Prompt Strategist, Art Director, Critic Agent, Safety & Brand Guard, and Production Agent.',
        },
        intermediatePrompt: {
          type: 'string',
          description: 'The first improved prompt draft before critique.',
        },
        finalPrompt: {
          type: 'string',
          description: 'The final optimized prompt that generation tools should use.',
        },
      },
      required: [
        'userIntent',
        'strategySteps',
        'agentReviews',
        'intermediatePrompt',
        'finalPrompt',
      ],
    },
  },
}

const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'submit_plan',
      description: 'Submit the list of steps you will take. Call this once, first.',
      parameters: {
        type: 'object',
        properties: { steps: { type: 'array', items: { type: 'string' } } },
        required: ['steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate one or more images from a prompt onto the canvas.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          n: { type: 'number', description: 'how many variations (1-4)' },
        },
        required: ['prompt'],
      },
    },
  },
  PROMPT_OPTIMIZATION_TOOL,
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: 'Generate a short video from a prompt onto the canvas.',
      parameters: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_text_note',
      description: 'Place a short text note on the canvas.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  },
]

const IMG = { w: 320, h: 320 }
const VID = { w: 400, h: 240 }
const NOTE = { w: 240, h: 120 }

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function buildPromptOptimization(
  args: Record<string, unknown>,
  fallbackPrompt = '',
): PromptOptimizationMetadata {
  const userIntent = typeof args.userIntent === 'string' ? args.userIntent : ''
  const strategySteps = asStringList(args.strategySteps)
  const agentReviews = Array.isArray(args.agentReviews) ? args.agentReviews : []
  const intermediatePrompt =
    typeof args.intermediatePrompt === 'string' ? args.intermediatePrompt : ''
  const finalPrompt =
    typeof args.finalPrompt === 'string' && args.finalPrompt.trim()
      ? args.finalPrompt.trim()
      : fallbackPrompt

  const parsedReviews = agentReviews
    .map((review): { agent: string; finding: string; improvement: string } | undefined => {
      if (!review || typeof review !== 'object') return undefined
      const item = review as Record<string, unknown>
      const agent = typeof item.agent === 'string' ? item.agent : 'Agent'
      const finding = typeof item.finding === 'string' ? item.finding : ''
      const improvement = typeof item.improvement === 'string' ? item.improvement : ''
      return { agent, finding, improvement }
    })
    .filter((review): review is { agent: string; finding: string; improvement: string } =>
      Boolean(review),
    )

  return {
    kind: 'prompt_optimization',
    userIntent,
    strategySteps,
    agentReviews: PROMPT_REVIEW_AGENTS.map((expectedAgent) => {
      const review = parsedReviews.find(
        (item) => item.agent.toLowerCase() === expectedAgent.name.toLowerCase(),
      )
      return {
        agent: expectedAgent.name,
        focus: expectedAgent.focus,
        finding: review?.finding ?? '',
        improvement: review?.improvement ?? '',
        status: review ? 'complete' : 'missing',
      }
    }),
    intermediatePrompt,
    finalPrompt,
  }
}

function formatPromptOptimization(optimization: PromptOptimizationMetadata, lang: Lang): string {
  const reviewLines = optimization.agentReviews.map((review) => {
    if (review.status === 'missing') {
      return lang === 'zh'
        ? `- **${review.agent}**: 未返回该角色的挑刺结果。`
        : `- **${review.agent}**: This role did not return a critique.`
    }
    return `- **${review.agent}**: ${review.finding}${review.improvement ? ` -> ${review.improvement}` : ''}`
  })

  const labels =
    lang === 'zh'
      ? {
          title: '提示词优化过程',
          intent: '意图识别',
          council: 'Agent Council',
          strategy: '优化策略拆解',
          review: '多 Agent 挑刺与增强',
          intermediate: '中间提示词',
          final: '最终优化提示词',
        }
      : {
          title: 'Prompt Optimization Process',
          intent: 'Intent',
          council: 'Agent Council',
          strategy: 'Optimization Strategy',
          review: 'Multi-Agent Critique and Improvements',
          intermediate: 'Intermediate Prompt',
          final: 'Final Optimized Prompt',
        }

  return [
    `### ${labels.title}`,
    optimization.userIntent ? `**1. ${labels.intent}**\n\n${optimization.userIntent}` : '',
    `**2. ${labels.council}**\n${optimization.agentReviews.map((agent) => `- **${agent.agent}**: ${agent.focus}`).join('\n')}`,
    optimization.strategySteps.length
      ? [
          `**3. ${labels.strategy}**`,
          ...optimization.strategySteps.map((step, index) => `${index + 1}. ${step}`),
        ].join('\n')
      : '',
    [`**4. ${labels.review}**`, ...reviewLines].join('\n'),
    optimization.intermediatePrompt
      ? `**5. ${labels.intermediate}**\n\n${optimization.intermediatePrompt}`
      : '',
    optimization.finalPrompt ? `**6. ${labels.final}**\n\n${optimization.finalPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function addPromptOptimizationMessage(
  projectId: string,
  optimization: PromptOptimizationMetadata,
  lang: Lang,
): void {
  useChat
    .getState()
    .addMessage(projectId, 'assistant', formatPromptOptimization(optimization, lang), {
      promptOptimization: optimization,
    })
}

function hasCompleteOptimization(optimization: PromptOptimizationMetadata): boolean {
  return (
    Boolean(optimization.finalPrompt.trim()) &&
    optimization.agentReviews.every((review) => review.status === 'complete')
  )
}

function samePrompt(left: string, right: string): boolean {
  return left.trim() === right.trim()
}

function parseToolArgs(call: ToolCall): Record<string, any> {
  try {
    const parsed = JSON.parse(call.function.arguments || '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {}
  } catch {
    return {}
  }
}

function isGenerationTool(name: string): boolean {
  return name === 'generate_image' || name === 'generate_video'
}

function recentSessionContext(
  projectId: string,
  currentVisiblePrompt: string,
  limit = 8,
): ChatMessage[] {
  const messages = useChat
    .getState()
    .messagesFor(projectId)
    .filter(
      (message) =>
        message.role !== 'tool' &&
        !message.metadata?.promptOptimization &&
        !message.metadata?.orchestration,
    )
  const withoutCurrent = messages.filter((message, index) => {
    const isLast = index === messages.length - 1
    return !(
      isLast &&
      message.role === 'user' &&
      message.content.trim() === currentVisiblePrompt.trim()
    )
  })
  return withoutCurrent.slice(-limit).map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
  }))
}

async function runTool(projectId: string, call: ToolCall, imageModelId?: string): Promise<string> {
  const args = parseToolArgs(call)
  const settings = useSettings.getState()
  const canvas = useCanvas.getState()
  const chat = useChat.getState()

  switch (call.function.name) {
    case 'submit_plan': {
      chat.setPlan(projectId, args.steps ?? [])
      return 'Plan submitted.'
    }
    case 'present_prompt_optimization': {
      const optimization = buildPromptOptimization(args)
      addPromptOptimizationMessage(projectId, optimization, settings.lang)
      return hasCompleteOptimization(optimization)
        ? `Prompt optimization shown to the user. Use this final optimized prompt for generation:\n${optimization.finalPrompt}`
        : 'Prompt optimization was shown, but it is incomplete. Call present_prompt_optimization again with all Agent Council reviews and a finalPrompt.'
    }
    case 'add_text_note': {
      const slot = canvas.nextSlot(projectId, NOTE.w, NOTE.h)
      canvas.addCard({
        projectId,
        type: 'note',
        status: 'ready',
        text: args.text,
        x: slot.x,
        y: slot.y,
        w: NOTE.w,
        h: NOTE.h,
      })
      return 'Note added.'
    }
    case 'generate_image': {
      const model = imageModelId ? { id: imageModelId } : settings.defaultModel('image')
      if (!model) return 'Error: no image model configured.'
      const n = Math.min(Math.max(args.n ?? 1, 1), 4)
      const cardIds: string[] = []
      for (let i = 0; i < n; i++) {
        const slot = canvas.nextSlot(projectId, IMG.w, IMG.h)
        cardIds.push(
          canvas.addCard({
            projectId,
            type: 'image',
            status: 'generating',
            prompt: args.prompt,
            model: model.id,
            x: slot.x,
            y: slot.y,
            w: IMG.w,
            h: IMG.h,
          }),
        )
      }
      try {
        const urls = await generateImage(model.id, args.prompt, '1024x1024', n)
        await Promise.all(
          cardIds.map(async (id, i) => {
            const media = await storeMedia(urls[i] ?? urls[0])
            useCanvas.getState().updateCard(id, { status: 'ready', ...media })
          }),
        )
        return `Generated ${cardIds.length} image(s).`
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        cardIds.forEach((id) =>
          useCanvas.getState().updateCard(id, { status: 'failed', error: msg }),
        )
        return `Error generating image: ${msg}`
      }
    }
    case 'generate_video': {
      const model = settings.defaultModel('video')
      if (!model) return 'Error: no video model configured.'
      const slot = canvas.nextSlot(projectId, VID.w, VID.h)
      const id = canvas.addCard({
        projectId,
        type: 'video',
        status: 'generating',
        prompt: args.prompt,
        model: model.id,
        x: slot.x,
        y: slot.y,
        w: VID.w,
        h: VID.h,
      })
      try {
        const url = await generateVideo(model.id, args.prompt)
        const media = await storeMedia(url)
        useCanvas.getState().updateCard(id, { status: 'ready', ...media })
        return 'Generated video.'
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        useCanvas.getState().updateCard(id, { status: 'failed', error: msg })
        return `Error generating video: ${msg}`
      }
    }
    default:
      return `Unknown tool: ${call.function.name}`
  }
}

// Mark plan steps done as tools complete (best-effort, sequential).
function advancePlan(projectId: string) {
  const steps = useChat.getState().plansFor(projectId)
  const next = steps.find((s) => s.status === 'pending' || s.status === 'running')
  if (next) useChat.getState().updateStep(next.id, 'done')
}

export function buildAgentSystemMessages(
  aspect?: string,
  openDesignContext?: string,
  lang: Lang = useSettings.getState().lang,
  videoKnowledgeContext?: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n${languageInstruction(lang)}`,
    },
  ]

  if (aspect) {
    messages.push({
      role: 'system',
      content:
        lang === 'zh'
          ? `生成图像的目标比例: ${aspect}。`
          : `Target aspect ratio for generated images: ${aspect}.`,
    })
  }

  if (openDesignContext) {
    messages.push({
      role: 'system',
      content:
        lang === 'zh'
          ? `Open Design 生成约束:
${openDesignContext}

使用这些规则塑造提示词、构图、字体、配色和规避清单；除非最终总结需要简短提及，否则保持为内部上下文。`
          : `Open Design generation contract:
${openDesignContext}

Use this context to shape prompts, composition, typography, palette, and avoid-lists; keep it internal unless a short mention helps the final summary.`,
    })
  }

  if (videoKnowledgeContext) {
    messages.push({
      role: 'system',
      content:
        lang === 'zh'
          ? `书本提炼的视频生成指导:
${videoKnowledgeContext}

请把这些规则作为内部导演思维，用于强化动作、镜头、光线、时间节奏、物理因果和参考素材保真。除非用户要求解释来源，否则不要逐字引用书本内容。`
          : `Book-derived video generation guidance:
${videoKnowledgeContext}

Use this as internal director thinking to strengthen action, camera, lighting, temporal rhythm, physical causality, and reference preservation. Do not quote the book unless the user asks for source explanation.`,
    })
  }

  return messages
}

function plainTextOptimization(
  content: string,
  fallbackPrompt: string,
): PromptOptimizationMetadata {
  const cleaned = content
    .trim()
    .replace(
      /^(final optimized prompt|optimized prompt|final prompt|最终优化提示词|优化提示词|最终提示词)\s*[:：]\s*/i,
      '',
    )
    .trim()
  return buildPromptOptimization(
    {
      userIntent: '',
      strategySteps: [],
      agentReviews: [],
      intermediatePrompt: '',
      finalPrompt: cleaned || fallbackPrompt,
    },
    fallbackPrompt,
  )
}

export async function optimizePromptForGeneration(
  projectId: string,
  prompt: string,
  aspect?: string,
  openDesignContext?: string,
  visibleUserPrompt = prompt,
  videoKnowledgeContext?: string,
): Promise<string> {
  const settings = useSettings.getState()
  const model = settings.defaultModel('chat')
  const lang = settings.lang
  if (!model) {
    throw new Error('No chat/orchestrator model configured for prompt optimization.')
  }

  const contextLines = [
    currentRuntimeDateContext(lang),
    aspect
      ? lang === 'zh'
        ? `生成图像或视频的目标比例: ${aspect}。`
        : `Target aspect ratio for image or video generation: ${aspect}.`
      : '',
    openDesignContext
      ? lang === 'zh'
        ? `生成上下文:\n${openDesignContext}`
        : `Generation context:\n${openDesignContext}`
      : '',
    videoKnowledgeContext
      ? lang === 'zh'
        ? `书本提炼的视频生成指导:\n${videoKnowledgeContext}`
        : `Book-derived video generation guidance:\n${videoKnowledgeContext}`
      : '',
    visibleUserPrompt !== prompt
      ? lang === 'zh'
        ? `用户可见请求:\n${visibleUserPrompt}`
        : `Visible user request:\n${visibleUserPrompt}`
      : '',
  ].filter(Boolean)
  const sessionContext = recentSessionContext(projectId, visibleUserPrompt)

  const history: ChatMessage[] = [
    {
      role: 'system',
      content: `You optimize prompts before any image or video generation.
Use this visible Agent Council:
${PROMPT_REVIEW_AGENT_TEXT}
Return one agentReviews item per council member.
Call present_prompt_optimization exactly once. Do not generate assets. Do not answer with plain text unless the tool call fails.
${languageInstruction(lang)}

${IMAGE_PROMPT_GUIDE}`,
    },
    ...(contextLines.length
      ? [{ role: 'system' as const, content: contextLines.join('\n\n') }]
      : []),
    ...(sessionContext.length
      ? [
          {
            role: 'system' as const,
            content:
              lang === 'zh'
                ? '同一项目中最近的对话上下文如下，用于继承偏好和约束：'
                : 'Recent conversation context from this project session, for carrying forward preferences and constraints:',
          },
          ...sessionContext,
        ]
      : []),
    { role: 'system', content: currentTurnPriorityInstruction(lang) },
    { role: 'user', content: prompt },
  ]

  const { message } = await chatCompletion(model.id, history, [PROMPT_OPTIMIZATION_TOOL])
  const call = message.tool_calls?.find(
    (toolCall) => toolCall.function.name === 'present_prompt_optimization',
  )
  if (!call) {
    const plainText = typeof message.content === 'string' ? message.content.trim() : ''
    if (!plainText) {
      throw new Error('Prompt optimization did not return a structured optimization process.')
    }
    const optimization = plainTextOptimization(plainText, prompt)
    addPromptOptimizationMessage(projectId, optimization, lang)
    return optimization.finalPrompt
  }

  const args = parseToolArgs(call)
  const optimization = buildPromptOptimization(args)
  if (!optimization.finalPrompt.trim()) {
    throw new Error('Prompt optimization did not return a final optimized prompt.')
  }
  addPromptOptimizationMessage(projectId, optimization, lang)
  return optimization.finalPrompt
}

export async function optimizePromptForGenerationOrOriginal(
  projectId: string,
  prompt: string,
  aspect?: string,
  openDesignContext?: string,
  visibleUserPrompt = prompt,
  videoKnowledgeContext?: string,
): Promise<string> {
  try {
    return await optimizePromptForGeneration(
      projectId,
      prompt,
      aspect,
      openDesignContext,
      visibleUserPrompt,
      videoKnowledgeContext,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const lang = useSettings.getState().lang
    useChat
      .getState()
      .addMessage(
        projectId,
        'assistant',
        lang === 'zh'
          ? `⚠️ 提示词优化失败，已使用原始提示词继续生成：${msg}`
          : `⚠️ Prompt optimization failed; continuing with the original prompt: ${msg}`,
      )
    return prompt
  }
}

export async function runAgent(
  projectId: string,
  userPrompt: string,
  aspect?: string,
  openDesignContext?: string,
  visibleUserPrompt = userPrompt,
  videoKnowledgeContext?: string,
  imageModelId?: string,
): Promise<void> {
  const chat = useChat.getState()
  const settings = useSettings.getState()
  const model = settings.defaultModel('chat')
  if (!model) {
    chat.addMessage(projectId, 'assistant', '⚠️ No chat/orchestrator model configured in Settings.')
    return
  }

  chat.setBusy(projectId, true)
  chat.addMessage(projectId, 'user', visibleUserPrompt)

  const preflightSystemMessages = buildAgentSystemMessages(
    aspect,
    openDesignContext,
    settings.lang,
    videoKnowledgeContext,
  )
  const conversationMessages = chat
    .messagesFor(projectId)
    .filter(
      (m) => m.role !== 'tool' && !m.metadata?.promptOptimization && !m.metadata?.orchestration,
    )
  const orchestration = buildAgentOrchestration({
    prompt: userPrompt,
    modeHint: videoKnowledgeContext ? 'video' : undefined,
    hasOpenDesign: Boolean(openDesignContext),
    hasRuntimeDate: true,
    hasVideoKnowledge: Boolean(videoKnowledgeContext),
    hasBranchModel: false,
    systemMessages: preflightSystemMessages.map((message) => message.content ?? ''),
    conversationMessages: conversationMessages.map((message) => message.content),
  })
  chat.addMessage(
    projectId,
    'assistant',
    settings.lang === 'zh' ? 'Agent 编排流程' : 'Agent orchestration flow',
    { orchestration },
  )

  const history: ChatMessage[] = [
    ...preflightSystemMessages,
    // Seed from persisted conversation so the agent has context.
    ...conversationMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'system', content: currentTurnPriorityInstruction(settings.lang) },
  ]

  if (visibleUserPrompt !== userPrompt) {
    history.push({
      role: 'system',
      content:
        settings.lang === 'zh'
          ? `当前用户请求的内部改写生成简报:\n${userPrompt}`
          : `Internal rewritten generation brief for the current user request:\n${userPrompt}`,
    })
  }

  try {
    let optimizedFinalPrompt = ''

    for (let turn = 0; turn < 12; turn++) {
      const { message } = await chatCompletion(model.id, history, TOOLS)
      history.push(message)

      const calls = message.tool_calls ?? []
      if (calls.length === 0) {
        if (message.content) chat.addMessage(projectId, 'assistant', message.content)
        break
      }

      for (const call of calls) {
        let result: string
        if (call.function.name === 'present_prompt_optimization') {
          const optimization = buildPromptOptimization(parseToolArgs(call))
          addPromptOptimizationMessage(projectId, optimization, settings.lang)
          if (hasCompleteOptimization(optimization)) {
            optimizedFinalPrompt = optimization.finalPrompt
            result = `Prompt optimization shown to the user. On the next turn, call generation with exactly this final optimized prompt:\n${optimizedFinalPrompt}`
          } else {
            result =
              'Prompt optimization was shown, but it is incomplete. Call present_prompt_optimization again with every Agent Council review and a non-empty finalPrompt.'
          }
          advancePlan(projectId)
        } else if (isGenerationTool(call.function.name)) {
          const args = parseToolArgs(call)
          const generationPrompt = typeof args.prompt === 'string' ? args.prompt : ''
          if (!optimizedFinalPrompt) {
            result =
              'Prompt optimization must be shown to the user before generation. Call present_prompt_optimization first.'
          } else if (!samePrompt(generationPrompt, optimizedFinalPrompt)) {
            result =
              'Generation prompt must exactly match the displayed final optimized prompt. Call the generation tool again with that finalPrompt.'
          } else {
            result = await runTool(projectId, call, imageModelId)
            advancePlan(projectId)
          }
        } else {
          result = await runTool(projectId, call, imageModelId)
          if (call.function.name !== 'submit_plan') advancePlan(projectId)
        }
        history.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
    }
    // Flush any remaining plan steps.
    useChat
      .getState()
      .plansFor(projectId)
      .filter((s) => s.status !== 'done')
      .forEach((s) => useChat.getState().updateStep(s.id, 'done'))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    chat.addMessage(projectId, 'assistant', `⚠️ Agent error: ${msg}`)
  } finally {
    useChat.getState().setBusy(projectId, false)
  }
}
