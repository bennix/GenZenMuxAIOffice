import rawCards from '../data/videoKnowledge.json'

export type VideoKnowledgeMode = 'image' | 'video'

export interface VideoKnowledgeCard {
  id: string
  chapter: string
  title: string
  keywords: string[]
  summary: string
  guidance: string
}

export interface VideoKnowledgeInput {
  prompt: string
  mode: VideoKnowledgeMode
  hasReferences: boolean
  duration?: number
  context?: string
  limit?: number
}

export const VIDEO_DIRECTOR_GUIDE = [
  'General World Model director guide:',
  '- Treat the request as a moving simulated world, not a static picture.',
  '- Define physical state: what moves, collides, drifts, transforms, or remains still.',
  '- Define camera intent: shot size, angle, trajectory, speed, and emotional distance.',
  '- Define lighting logic: source, temperature, reflection behavior, contrast, and mood.',
  '- Define temporal rhythm: opening beat, motion beat, lingering beat, and final state.',
  '- Define narrative pressure: what the viewer should feel before they can explain the scene.',
  '- For references, preserve identity and composition anchors before adding motion, light, or atmosphere.',
].join('\n')

const VIDEO_KNOWLEDGE_CARDS = rawCards as VideoKnowledgeCard[]
const TOKEN_RE = /[a-z0-9\u4e00-\u9fff-]+/gi

function tokensFor(value: string): Set<string> {
  return new Set((value.toLowerCase().match(TOKEN_RE) ?? []).filter((token) => token.length > 1))
}

function cardSearchText(card: VideoKnowledgeCard): string {
  return [card.id, card.title, card.chapter, card.summary, card.guidance, ...card.keywords]
    .join(' ')
    .toLowerCase()
}

function scoreCard(card: VideoKnowledgeCard, input: VideoKnowledgeInput): number {
  const searchText = cardSearchText(card)
  const queryTokens = tokensFor([input.prompt, input.context ?? ''].join(' '))
  let score = 0

  queryTokens.forEach((token) => {
    if (searchText.includes(token)) score += 1
    if (card.keywords.some((keyword) => keyword.toLowerCase() === token)) score += 2
  })

  if (input.hasReferences && card.id === 'reference-continuity') score += 8
  if (input.hasReferences && card.id === 'physical-causality') score += 2
  if (input.duration && card.id === 'temporal-rhythm') score += 3
  if (card.id === 'world-model-control') score += 1

  return score
}

export function retrieveVideoKnowledgeCards(input: VideoKnowledgeInput): VideoKnowledgeCard[] {
  if (input.mode !== 'video') return []
  const limit = Math.max(1, Math.min(input.limit ?? 4, 6))

  return VIDEO_KNOWLEDGE_CARDS.map((card, index) => ({
    card,
    index,
    score: scoreCard(card, input),
  }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.card)
}

export function buildVideoKnowledgeContext(input: VideoKnowledgeInput): string | undefined {
  if (input.mode !== 'video') return undefined
  const cards = retrieveVideoKnowledgeCards(input)
  const cardText = cards
    .map((card) =>
      [
        `Knowledge card: ${card.title} (${card.chapter})`,
        `Summary: ${card.summary}`,
        `Guidance: ${card.guidance}`,
      ].join('\n'),
    )
    .join('\n\n')

  return [
    VIDEO_DIRECTOR_GUIDE,
    cardText ? `Relevant book-derived knowledge cards:\n${cardText}` : '',
    'Use this as internal prompt-construction guidance. Do not quote or cite the book unless the user asks.',
  ]
    .filter(Boolean)
    .join('\n\n')
}
