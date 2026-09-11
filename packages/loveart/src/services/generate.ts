import { sketchReferenceGuidance } from './imagePromptGuidance'
import type { VideoSettings } from './videoModels'
// Shared generation routing used by both the Home hero and the workspace prompt bar.
// Routes a composed request (mode/style/aspect/references) to the right ZenMux flow and
// records it in the project thread so the agent has continuous context.
import { optimizePromptForGenerationOrOriginal, runAgent } from './agent'
import { referenceToImage, referenceToVideo, textToImage, textToVideo } from './edits'
import {
  applyOpenDesignTemplate,
  composeOpenDesignContext,
  isAppliedOpenDesignPrompt,
  openDesignSystemById,
  openDesignTemplateById,
} from './openDesign'
import {
  applyYouMindTemplate,
  composeYouMindGuidance,
  isAppliedYouMindPrompt,
  youMindCategoryById,
  youMindTemplateById,
} from './youmind'
import { styleBySlug, applyStyle } from './styleTemplates'
import type { Aspect } from './styleTemplates'
import { buildVideoKnowledgeContext } from './videoKnowledge'
import { humanSceneToGenerationContext } from './humanScene'
import { useChat } from '../store/chatStore'
import { useSettings } from '../store/settingsStore'
import { useCanvas } from '../store/canvasStore'

export interface GenLabels {
  genDone: string
  genFailed: string
  reference: string
  image: string
  video: string
}

export interface GenRequest extends VideoSettings {
  videoAspect?: string
  sketchReferenceIndices?: number[]
  text: string
  mode: 'image' | 'video'
  aspect: Aspect
  duration?: number
  styleSlug: string | null
  refBlobs: Blob[]
  openDesignSystemId?: string | null
  openDesignTemplateId?: string | null
  youMindCategoryId?: string | null
  youMindTemplateId?: string | null
  humanSceneId?: string | null
  useHumanSceneReference?: boolean
  labels: GenLabels
}

function referenceGuidance(refN: number, mode: GenRequest['mode'], lang: 'zh' | 'en'): string {
  if (lang === 'zh') {
    return [
      `参考图约束: 已附加 ${refN} 张参考图。`,
      '必须把参考图作为主要视觉来源、主体来源和构图依据。',
      '不要把参考图里的主体替换成其它产品、物体或品牌；上下文和模板只能影响风格、镜头、节奏、排版和质感。',
      mode === 'video'
        ? '生成视频时保持参考主体身份一致，只添加合理运动、镜头推进、光影和场景氛围。'
        : '生成图像时保持参考主体身份一致，只调整风格、构图、光影和画面完成度。',
    ].join('\n')
  }

  return [
    `Reference constraint: ${refN} reference image(s) are attached.`,
    'Use the attached reference image(s) as the primary visual source, subject source, and composition anchor.',
    'Do not replace the referenced subject with another product, object, or brand; context and templates may only affect style, camera, pacing, typography, and material finish.',
    mode === 'video'
      ? 'For video, preserve the referenced subject identity and add only plausible motion, camera movement, lighting, and atmosphere.'
      : 'For image generation, preserve the referenced subject identity and adjust only style, composition, lighting, and finish.',
  ].join('\n')
}

function withReferenceGuidance(
  prompt: string,
  refN: number,
  mode: GenRequest['mode'],
  lang: 'zh' | 'en',
): string {
  if (!refN) return prompt
  const marker = lang === 'zh' ? '参考图约束:' : 'Reference constraint:'
  if (prompt.includes(marker)) return prompt
  return `${referenceGuidance(refN, mode, lang)}\n\nUser request:\n${prompt}`
}

function humanSceneReferenceGuidance(lang: 'zh' | 'en'): string {
  return lang === 'zh'
    ? [
        '人物场景草图参考约束: 已附加的人物场景 SVG 只用于站位、姿态、朝向和空间关系控制。',
        '不要把草图中的方块人、颜色、线条、标签、控制框或锚点当作最终主体身份、服装、画风或背景。',
      ].join('\n')
    : [
        'Human scene sketch reference constraint: the attached Human Scene SVG is for blocking, pose, facing, and spatial relation control only.',
        'Do not treat the block figure, colors, lines, labels, control boxes, or anchors as final subject identity, wardrobe, style, or background.',
      ].join('\n')
}

function withHumanSceneReferenceGuidance(prompt: string, lang: 'zh' | 'en'): string {
  const marker =
    lang === 'zh' ? '人物场景草图参考约束:' : 'Human scene sketch reference constraint:'
  if (prompt.includes(marker)) return prompt
  return `${humanSceneReferenceGuidance(lang)}\n\nUser request:\n${prompt}`
}

export async function runGeneration(projectId: string, req: GenRequest): Promise<void> {
  const { text, mode, aspect, duration, styleSlug, refBlobs, labels } = req
  const videoSettings: VideoSettings | undefined =
    req.videoMode || req.resolution || req.generateAudio !== undefined || req.model
      ? {
          videoMode: req.videoMode,
          resolution: req.resolution,
          generateAudio: req.generateAudio,
          model: req.model,
        }
      : undefined
  const videoAspect = req.videoAspect ?? aspect
  const lang = useSettings.getState().lang
  let effectiveRefBlobs = refBlobs
  let humanSceneContext = ''
  let hasHumanSceneReference = false

  if (mode === 'video' && req.humanSceneId) {
    const scene = useCanvas
      .getState()
      .humanScenes.find((item) => item.id === req.humanSceneId && item.projectId === projectId)

    if (scene && scene.people.length > 0) {
      const context = await humanSceneToGenerationContext({
        scene,
        aspect,
        language: lang,
        includeReference: Boolean(req.useHumanSceneReference),
      })
      humanSceneContext = context.textConstraint
      if (context.referenceBlob) {
        effectiveRefBlobs = [...effectiveRefBlobs, context.referenceBlob]
        hasHumanSceneReference = true
      }
    }
  }

  const openDesignSystemId = req.openDesignSystemId ?? null
  const openDesignTemplateId = req.openDesignTemplateId ?? null
  const openDesignSystem = openDesignSystemById(openDesignSystemId, lang)
  const openDesignTemplate = openDesignTemplateById(openDesignTemplateId, lang)
  const openDesignContext = openDesignSystem
    ? composeOpenDesignContext({ designSystem: openDesignSystem, locale: lang })
    : undefined
  const useYouMind = mode === 'image'
  const youMindCategoryId = useYouMind ? (req.youMindCategoryId ?? null) : null
  const youMindTemplateId = useYouMind ? (req.youMindTemplateId ?? null) : null
  const youMindTemplate = youMindTemplateById(youMindTemplateId, lang)
  const youMindCategory = youMindCategoryById(
    youMindCategoryId ?? youMindTemplate?.categoryId,
    lang,
  )
  const youMindContext = composeYouMindGuidance({ category: youMindCategory, locale: lang })
  const sketchContext = sketchReferenceGuidance(
    req.sketchReferenceIndices ?? [],
    refBlobs.length,
    lang,
  )
  const combinedContext =
    [openDesignContext, youMindContext, humanSceneContext, sketchContext]
      .filter(Boolean)
      .join('\n\n') || undefined
  const shouldUseAgentForContext = Boolean(openDesignContext || youMindContext)
  const videoKnowledgeContext = buildVideoKnowledgeContext({
    prompt: text,
    mode,
    hasReferences: effectiveRefBlobs.length > 0,
    duration,
    context: combinedContext,
  })
  const withGenerationContext = (prompt: string) =>
    combinedContext ? `${prompt}\n\n${combinedContext}` : prompt
  const videoDirection =
    lang === 'zh'
      ? '请使用所选视觉方向生成视频概念。'
      : 'Generate this as a video concept using the selected visual direction.'

  // Style applies to image mode only.
  const style = mode === 'image' && styleSlug ? styleBySlug(styleSlug) : undefined

  // Record a direct (non-agent) generation in the thread for context + feedback.
  const recordStart = () => {
    const chat = useChat.getState()
    chat.addMessage(projectId, 'user', text)
  }
  const record = (kind: string, refN: number) => {
    const chat = useChat.getState()
    const refNote = refN ? ` (${refN} ${labels.reference})` : ''
    chat.addMessage(projectId, 'assistant', `🪄 ${labels.genDone}: ${kind}${refNote}`)
  }
  const recordFailure = (kind: string, error: unknown) => {
    const chat = useChat.getState()
    const msg = error instanceof Error ? error.message : String(error)
    chat.addMessage(projectId, 'assistant', `⚠️ ${labels.genFailed}: ${kind} — ${msg}`)
  }
  const runDirect = async (
    kind: string,
    refN: number,
    prompt: string,
    generate: (optimizedPrompt: string) => Promise<void>,
  ) => {
    recordStart()
    const userReferenceCount = refBlobs.length
    const promptWithReferenceGuidance = withReferenceGuidance(
      prompt,
      userReferenceCount,
      mode,
      lang,
    )
    const promptForOptimization = hasHumanSceneReference
      ? withHumanSceneReferenceGuidance(promptWithReferenceGuidance, lang)
      : promptWithReferenceGuidance
    const optimizedPrompt = await optimizePromptForGenerationOrOriginal(
      projectId,
      promptForOptimization,
      mode === 'video' ? videoAspect : aspect,
      combinedContext,
      text,
      videoKnowledgeContext,
    )
    const optimizedWithReferenceGuidance = withReferenceGuidance(
      optimizedPrompt,
      userReferenceCount,
      mode,
      lang,
    )
    const generationPrompt = hasHumanSceneReference
      ? withHumanSceneReferenceGuidance(optimizedWithReferenceGuidance, lang)
      : optimizedWithReferenceGuidance

    try {
      await generate(sketchContext ? `${generationPrompt}\n\n${sketchContext}` : generationPrompt)
      record(kind, refN)
    } catch (error) {
      recordFailure(kind, error)
    }
  }

  if (youMindTemplateId && !youMindTemplate) {
    const chat = useChat.getState()
    chat.addMessage(projectId, 'user', text)
    chat.addMessage(projectId, 'assistant', `⚠️ YouMind template not found: ${youMindTemplateId}`)
    return
  }

  if (openDesignTemplateId && !openDesignTemplate) {
    const chat = useChat.getState()
    chat.addMessage(projectId, 'user', text)
    chat.addMessage(
      projectId,
      'assistant',
      `⚠️ Open Design template not found: ${openDesignTemplateId}`,
    )
    return
  }

  if (youMindTemplate) {
    const prompt = isAppliedYouMindPrompt(text)
      ? text
      : applyYouMindTemplate(youMindTemplate, {
          brief: text,
          aspect,
          locale: lang,
          category: youMindCategory,
        })

    if (!effectiveRefBlobs.length && (mode !== 'video' || !videoSettings)) {
      const agentPrompt = mode === 'video' ? `${prompt}\n\n${videoDirection}` : prompt
      await runAgent(
        projectId,
        agentPrompt,
        aspect,
        combinedContext,
        text,
        videoKnowledgeContext,
        ...(mode === 'image' && req.model ? [req.model] : []),
      )
      return
    }

    const directPrompt = mode === 'video' ? `${prompt}\n\n${videoDirection}` : prompt
    await runDirect(
      mode === 'video' ? labels.video : labels.image,
      effectiveRefBlobs.length,
      directPrompt,
      async (optimizedPrompt) => {
        if (mode === 'video') {
          if (effectiveRefBlobs.length) {
            await referenceToVideo(
              projectId,
              optimizedPrompt,
              effectiveRefBlobs,
              videoAspect,
              duration,
              ...(videoSettings ? [videoSettings] : []),
            )
          } else {
            await textToVideo(
              projectId,
              optimizedPrompt,
              videoAspect,
              duration,
              ...(videoSettings ? [videoSettings] : []),
            )
          }
        } else if (effectiveRefBlobs.length) {
          await (req.model
            ? referenceToImage(projectId, optimizedPrompt, effectiveRefBlobs, 1, req.model)
            : referenceToImage(projectId, optimizedPrompt, effectiveRefBlobs))
        } else {
          await textToImage(projectId, optimizedPrompt, 1, ...(req.model ? [req.model] : []))
        }
      },
    )
    return
  }

  if (openDesignTemplate) {
    const prompt = isAppliedOpenDesignPrompt(text)
      ? text
      : applyOpenDesignTemplate(openDesignTemplate, {
          brief: text,
          aspect,
          designSystem: openDesignSystem,
          locale: lang,
        })

    if (!effectiveRefBlobs.length && (mode !== 'video' || !videoSettings)) {
      await runAgent(
        projectId,
        prompt,
        aspect,
        combinedContext,
        text,
        videoKnowledgeContext,
        ...(mode === 'image' && req.model ? [req.model] : []),
      )
      return
    }

    await runDirect(
      mode === 'video' ? labels.video : labels.image,
      effectiveRefBlobs.length,
      prompt,
      async (optimizedPrompt) => {
        if (mode === 'video') {
          if (effectiveRefBlobs.length) {
            await referenceToVideo(
              projectId,
              optimizedPrompt,
              effectiveRefBlobs,
              videoAspect,
              duration,
              ...(videoSettings ? [videoSettings] : []),
            )
          } else {
            await textToVideo(
              projectId,
              optimizedPrompt,
              videoAspect,
              duration,
              ...(videoSettings ? [videoSettings] : []),
            )
          }
        } else if (effectiveRefBlobs.length) {
          await (req.model
            ? referenceToImage(projectId, optimizedPrompt, effectiveRefBlobs, 1, req.model)
            : referenceToImage(projectId, optimizedPrompt, effectiveRefBlobs))
        } else {
          await textToImage(projectId, optimizedPrompt, 1, ...(req.model ? [req.model] : []))
        }
      },
    )
    return
  }

  if (
    (mode !== 'video' || !videoSettings) &&
    shouldUseAgentForContext &&
    combinedContext &&
    !effectiveRefBlobs.length
  ) {
    const agentPrompt = style ? applyStyle(style, text, aspect) : text
    await runAgent(
      projectId,
      agentPrompt,
      aspect,
      combinedContext,
      text,
      videoKnowledgeContext,
      ...(mode === 'image' && req.model ? [req.model] : []),
    )
    return
  }

  if (mode === 'video') {
    const prompt = withGenerationContext(text)
    await runDirect(labels.video, effectiveRefBlobs.length, prompt, async (optimizedPrompt) => {
      if (effectiveRefBlobs.length)
        await referenceToVideo(
          projectId,
          optimizedPrompt,
          effectiveRefBlobs,
          videoAspect,
          duration,
          ...(videoSettings ? [videoSettings] : []),
        )
      else
        await textToVideo(
          projectId,
          optimizedPrompt,
          videoAspect,
          duration,
          ...(videoSettings ? [videoSettings] : []),
        )
    })
    return
  }

  // Image mode
  if (effectiveRefBlobs.length) {
    const p = withGenerationContext(style ? applyStyle(style, text, aspect) : text)
    await runDirect(labels.image, effectiveRefBlobs.length, p, (optimizedPrompt) =>
      req.model
        ? referenceToImage(projectId, optimizedPrompt, effectiveRefBlobs, 1, req.model)
        : referenceToImage(projectId, optimizedPrompt, effectiveRefBlobs),
    )
    return
  }
  if (style) {
    await runAgent(
      projectId,
      withGenerationContext(applyStyle(style, text, aspect)),
      aspect,
      combinedContext,
      text,
      videoKnowledgeContext,
      ...(req.model ? [req.model] : []),
    )
    return
  }
  // Free-form image → conversational agent (records its own thread + uses prior context).
  await runAgent(
    projectId,
    text,
    aspect,
    combinedContext,
    text,
    videoKnowledgeContext,
    ...(mode === 'image' && req.model ? [req.model] : []),
  )
}
