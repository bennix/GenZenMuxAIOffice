/** Original GenOffice presets: shared by previews, planning and page generation. */
export const DECK_DESIGNS = [
  {
    id: 'business',
    zh: '清晰商务',
    en: 'Clear business',
    bg: '#F4F7FB',
    ink: '#172B4D',
    accent: '#2459B8',
    font: 'Aptos, "PingFang SC", "Microsoft YaHei", sans-serif',
    layout: 'left_text_right_image',
    keywords: /报告|汇报|商业|融资|report|pitch|business/i,
  },
  {
    id: 'editorial',
    zh: '杂志叙事',
    en: 'Editorial story',
    bg: '#FAF6ED',
    ink: '#34352C',
    accent: '#7A472B',
    font: 'Georgia, "Songti SC", SimSun, serif',
    layout: 'cover_magazine',
    keywords: /品牌|故事|文化|历史|brand|story|culture/i,
  },
  {
    id: 'contrast',
    zh: '深色聚焦',
    en: 'Dark focus',
    bg: '#142D2B',
    ink: '#F4F8F3',
    accent: '#ACE5C4',
    font: '"Avenir Next", "PingFang SC", sans-serif',
    layout: 'hero_big_number',
    keywords: /科技|发布|演讲|成果|tech|launch|keynote/i,
  },
  {
    id: 'swiss',
    zh: '网格信息',
    en: 'Grid and evidence',
    bg: '#FFFFFF',
    ink: '#17212B',
    accent: '#B42318',
    font: 'Arial, "PingFang SC", sans-serif',
    layout: 'two_column_comparison',
    keywords: /分析|数据|研究|analysis|research|data/i,
  },
  {
    id: 'blueprint',
    zh: '工程蓝图',
    en: 'Technical blueprint',
    bg: '#0D2137',
    ink: '#F2F7FC',
    accent: '#76D6EA',
    font: 'Arial, "Microsoft YaHei", sans-serif',
    layout: 'timeline_horizontal',
    keywords: /架构|工程|流程|系统|architecture|engineering|process/i,
  },
] as const
export type DeckDesign = (typeof DECK_DESIGNS)[number]

export function designCandidates(topic: string): DeckDesign[] {
  const first = DECK_DESIGNS.find((style) => style.keywords.test(topic)) ?? DECK_DESIGNS[0]
  const rest = [DECK_DESIGNS[1], DECK_DESIGNS[2], DECK_DESIGNS[3]].filter(
    (style) => style.id !== first.id,
  )
  return [first, ...rest].slice(0, 3)
}

export function designContract(style: DeckDesign, large = false): string {
  return `Selected design: ${style.en}. Lock the palette for the entire deck: background ${style.bg}, ink ${style.ink}, accent ${style.accent}; neutral white/black may be used for contrast. Do not invent additional accent colors. Font stack: ${style.font}. At 1280x720: title >= ${large ? 56 : 48}px, body >= ${large ? 38 : 32}px, caption >=24px, footer >=18px. Use data-pptx-role on text. Keep 48px canvas margins, 32px bottom safe area and 16px card padding. Prefer ${style.layout} for the opening, then choose layouts by content. Never shrink fonts, crop text or add overflow:hidden to hide a layout failure. Split dense content into additional pages when page count is flexible; otherwise report the conflict. Preserve facts and data provenance.`
}

export const DESIGN_REVIEW_RULES = `Review every slide in five dimensions: (1) hierarchy: one main conclusion, clear title/body/caption levels; (2) readability: readable type and adequate foreground/background contrast; (3) composition: alignment, balanced whitespace, no glyph/card/canvas overflow; (4) consistency: same approved palette, type scale and spacing throughout the deck; (5) fidelity: preserve user facts, evidence and image meaning. Fix defects, not personal taste. One unresolved overflow or illegible text is a failed slide regardless of visual polish.
Choose a layout from content: comparison -> two columns; chronology -> timeline; one key metric -> hero number; 2-4 metrics -> KPI row; evidence -> chart with one takeaway; narrative -> image plus text; parallel points -> up to three columns; process -> ordered steps; quotation -> large quote with attribution; closing -> one clear call to action. Repeat a useful layout when appropriate; do not force every page to be unique. On editable PPTX paths avoid WebGL, animation-dependent information, SVG, transforms and external font dependencies.`
