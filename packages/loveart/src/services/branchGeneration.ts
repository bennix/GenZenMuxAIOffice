import { useCanvas } from '../store/canvasStore'
import { useSettings, type Lang } from '../store/settingsStore'
import type { CanvasEdge, Card } from '../types'
import { optimizePromptForGenerationOrOriginal } from './agent'
import { storeMedia } from './assetStore'
import { blobForCard, blobToBase64, mergeRefsForVideo } from './edits'
import { sketchReferenceGuidance } from './imagePromptGuidance'
import { humanSceneToGenerationContext } from './humanScene'
import { buildVideoKnowledgeContext } from './videoKnowledge'
import { editImages, generateImage, generateVideo } from './zenmux'
import { currentRuntimeDateContext } from './runtimeContext'
import { normalizeVideoOptions } from './videoModels'

const ASPECT = '16:9'
const IMAGE_SIZE = '1024x1024'

export interface BranchBriefInput {
  source: Card
  edge: Pick<
    CanvasEdge,
    | 'prompt'
    | 'outputMode'
    | 'useSourceAsReference'
    | 'model'
    | 'humanSceneId'
    | 'useHumanSceneReference'
  >
  humanSceneTextConstraint?: string
  language?: Lang
}

function sourceText(source: Card): string {
  return source.prompt?.trim() || source.text?.trim() || '(empty)'
}

function humanSceneSection(text: string | undefined, lang: Lang): string | undefined {
  const trimmed = text?.trim()
  if (!trimmed) return undefined
  return lang === 'zh'
    ? `分支人物场景约束:\n${trimmed}`
    : `Branch human scene constraints:\n${trimmed}`
}

export function buildBranchBrief(input: BranchBriefInput): string {
  const lang = input.language ?? useSettings.getState().lang
  const sourceKind = input.source.type
  const referenceLine = input.edge.useSourceAsReference
    ? lang === 'zh'
      ? '开启，尽量保留源卡片的主体、构图和视觉连续性。'
      : 'On. Preserve the source card subject, composition, and visual continuity where useful.'
    : lang === 'zh'
      ? '关闭，不要把源卡片当作像素参考，只使用文字意图。'
      : 'Off. Do not use the source card as a pixel reference; use only the text intent.'
  const sceneSection = humanSceneSection(input.humanSceneTextConstraint, lang)

  if (lang === 'zh') {
    return [
      '请使用中文撰写最终生成提示词。',
      currentRuntimeDateContext(lang),
      `分支输出: ${input.edge.outputMode === 'video' ? '视频' : '图片'}`,
      `分支修改: ${input.edge.prompt.trim() || '延续源卡片并生成一个清晰的新分支。'}`,
      sceneSection,
      `源卡片类型: ${sourceKind}`,
      `是否使用源卡片参考: ${referenceLine}`,
      `源卡片提示词: ${sourceText(input.source)}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    'Write the final generation prompt in English.',
    currentRuntimeDateContext(lang),
    `Branch output: ${input.edge.outputMode}`,
    `Branch modification: ${input.edge.prompt.trim() || 'Extend the source card into a clear new branch.'}`,
    sceneSection,
    `Source card type: ${sourceKind}`,
    `Use source as reference: ${referenceLine}`,
    `Source card prompt: ${sourceText(input.source)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fail(
  projectId: string,
  edgeId: string | undefined,
  targetId: string | undefined,
  error: unknown,
) {
  const msg = messageFor(error)
  const canvas = useCanvas.getState()
  if (targetId) {
    const target = canvas.cards.find((card) => card.id === targetId && card.projectId === projectId)
    if (target) canvas.updateCard(target.id, { status: 'failed', error: msg })
  }
  if (edgeId) canvas.updateEdge(edgeId, { status: 'failed', error: msg })
}

function currentTargetForCompletion(
  projectId: string,
  edgeId: string,
  capturedTargetId: string,
): Card | undefined {
  const canvas = useCanvas.getState()
  const currentEdge = (canvas.edges ?? []).find((candidate) => candidate.id === edgeId)
  if (
    !currentEdge ||
    currentEdge.projectId !== projectId ||
    currentEdge.targetCardId !== capturedTargetId
  ) {
    return undefined
  }

  return canvas.cards.find((card) => card.id === capturedTargetId && card.projectId === projectId)
}

function failCurrent(projectId: string, edgeId: string, capturedTargetId: string, error: unknown) {
  const currentTarget = currentTargetForCompletion(projectId, edgeId, capturedTargetId)
  if (!currentTarget) return

  const msg = messageFor(error)
  const canvas = useCanvas.getState()
  canvas.updateCard(currentTarget.id, { status: 'failed', error: msg })
  canvas.updateEdge(edgeId, { status: 'failed', error: msg })
}

function requireDefaultModel(category: 'image' | 'video'): string {
  const model = useSettings.getState().defaultModel(category)?.id
  if (!model) throw new Error(`No default ${category} model configured.`)
  return model
}

function modelFor(edge: CanvasEdge, category: 'image' | 'video'): string {
  return edge.model || requireDefaultModel(category)
}

export async function runBranchGeneration(
  projectId: string,
  edgeId: string,
  attachments: Array<{ blob: Blob; kind?: 'sketch' }> = [],
): Promise<void> {
  const initial = useCanvas.getState()
  const edge = (initial.edges ?? []).find(
    (candidate) => candidate.id === edgeId && candidate.projectId === projectId,
  )

  if (!edge) {
    return
  }

  const source = initial.cards.find(
    (card) => card.id === edge.sourceCardId && card.projectId === projectId,
  )
  const target = edge.targetCardId
    ? initial.cards.find((card) => card.id === edge.targetCardId && card.projectId === projectId)
    : undefined

  if (!source || !target) {
    fail(
      projectId,
      edge.id,
      edge.targetCardId,
      new Error(!source ? 'Branch source card is missing.' : 'Branch target card is missing.'),
    )
    return
  }

  try {
    const language = useSettings.getState().lang
    const videoModel = edge.outputMode === 'video' ? modelFor(edge, 'video') : undefined
    const duration = normalizeVideoOptions(videoModel ?? '', { duration: edge.duration }).duration
    const usesSourceReference =
      edge.useSourceAsReference && (source.type === 'image' || source.type === 'video')
    const usesImageReference = usesSourceReference && source.type === 'image'
    const imageRefs = [
      ...(usesImageReference ? [await blobForCard(source)] : []),
      ...attachments.map((ref) => ref.blob),
    ]
    const sketchContext = sketchReferenceGuidance(
      attachments.flatMap((ref, index) =>
        ref.kind === 'sketch' ? [index + Number(usesImageReference)] : [],
      ),
      imageRefs.length,
      language,
    )
    const referenceContext = imageRefs.length
      ? [
          language === 'zh'
            ? `共附加 ${imageRefs.length} 张参考图，按附件顺序编号。${usesImageReference ? '参考图 1 是源卡片，其余是本分支附件。' : '全部为本分支附件，不包含源卡片。'}按用户要求使用各图，不要把所有元素混合复制。`
            : `${imageRefs.length} reference images are attached in order. ${usesImageReference ? 'Reference 1 is the source card; the rest are branch attachments.' : 'All are branch attachments; the source card is excluded.'} Use each according to the user request; do not copy every element together.`,
          sketchContext,
        ]
          .filter(Boolean)
          .join('\n')
      : undefined
    const humanSceneContext =
      edge.outputMode === 'video' && edge.humanSceneId
        ? await (async () => {
            const scene = initial.humanScenes.find(
              (candidate) =>
                candidate.id === edge.humanSceneId && candidate.projectId === projectId,
            )
            if (!scene) return undefined
            const context = await humanSceneToGenerationContext({
              scene,
              aspect: ASPECT,
              language,
              includeReference: Boolean(edge.useHumanSceneReference),
            })
            return context.textConstraint ? context : undefined
          })()
        : undefined
    const brief = buildBranchBrief({
      source,
      edge,
      humanSceneTextConstraint: humanSceneContext?.textConstraint,
      language,
    })
    const videoContext = [humanSceneContext?.textConstraint, sourceText(source)]
      .filter(Boolean)
      .join('\n\n')
    const videoKnowledgeContext =
      edge.outputMode === 'video'
        ? [
            buildVideoKnowledgeContext({
              prompt: brief,
              mode: 'video',
              hasReferences:
                usesSourceReference ||
                imageRefs.length > 0 ||
                Boolean(humanSceneContext?.referenceBlob),
              duration,
              context: videoContext || undefined,
            }),
            videoContext ? `Branch video context:\n${videoContext}` : undefined,
          ]
            .filter(Boolean)
            .join('\n\n')
        : undefined
    const optimized = await optimizePromptForGenerationOrOriginal(
      projectId,
      brief,
      ASPECT,
      referenceContext,
      edge.prompt,
      videoKnowledgeContext,
    )
    const optimizedPrompt = referenceContext ? `${optimized}\n\n${referenceContext}` : optimized

    if (edge.outputMode === 'image') {
      const model = modelFor(edge, 'image')
      const urls = imageRefs.length
        ? await editImages(imageRefs, optimizedPrompt, {
            model,
            n: 1,
            size: IMAGE_SIZE,
          })
        : await generateImage(model, optimizedPrompt, IMAGE_SIZE, 1)
      if (!currentTargetForCompletion(projectId, edge.id, target.id)) return
      const media = await storeMedia(urls[0])
      const currentTarget = currentTargetForCompletion(projectId, edge.id, target.id)
      if (!currentTarget) return
      useCanvas.getState().updateCard(currentTarget.id, {
        status: 'ready',
        prompt: optimizedPrompt,
        model,
        error: undefined,
        ...media,
      })
      useCanvas.getState().updateEdge(edge.id, { status: 'ready', error: undefined })
      return
    }

    const model = videoModel!
    const url =
      imageRefs.length || humanSceneContext?.referenceBlob
        ? await (async () => {
            const refs = [
              ...imageRefs,
              ...(humanSceneContext?.referenceBlob ? [humanSceneContext.referenceBlob] : []),
            ]
            const merged = await mergeRefsForVideo(refs, ASPECT)
            const base64 = await blobToBase64(merged)
            return generateVideo(model, optimizedPrompt, {
              image: { base64, mimeType: merged.type || 'image/jpeg' },
              aspect: ASPECT,
              duration,
            })
          })()
        : await generateVideo(model, optimizedPrompt, { aspect: ASPECT, duration })
    if (!currentTargetForCompletion(projectId, edge.id, target.id)) return
    const media = await storeMedia(url)
    const currentTarget = currentTargetForCompletion(projectId, edge.id, target.id)
    if (!currentTarget) return
    useCanvas.getState().updateCard(currentTarget.id, {
      status: 'ready',
      prompt: optimizedPrompt,
      model,
      error: undefined,
      ...media,
    })
    useCanvas.getState().updateEdge(edge.id, { status: 'ready', error: undefined })
  } catch (error) {
    failCurrent(projectId, edge.id, target.id, error)
  }
}
