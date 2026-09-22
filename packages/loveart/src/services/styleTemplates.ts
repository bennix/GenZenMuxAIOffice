// Visual style templates distilled from the AI Visual Prompt Cookbook
// (https://github.com/VigoZhao/AI-Visual-Prompt-Cookbook, MIT). Each carries a
// prompt_template with {VARIABLE} placeholders; applyStyle() fills SUBJECT + ASPECT_RATIO
// from the user's input and drops the other unfilled variable fragments, leaving the rich
// style-rules block that drives the look.
import templates from '../data/styleTemplates.json'

export type StyleTemplateLocale = 'en' | 'zh'

export interface StyleVariable {
  key: string
  hint: string
}
export interface StyleTemplate {
  slug: string
  name: string
  summary: string
  category: string
  variables: StyleVariable[]
  promptTemplate: string
  negativePrompt: string
  preview: string
}

export const STYLE_TEMPLATES = templates as StyleTemplate[]

type StyleTemplateLocalization = Pick<StyleTemplate, 'name' | 'summary'>

const STYLE_LOCALIZATIONS_ZH: Record<string, StyleTemplateLocalization> = {
  'acid-lime-3d-streetwear-type-poster-style': {
    name: '酸橙 3D 街头服饰文字海报',
    summary:
      '偏潮牌广告的 3D 海报风格：浅色棚拍空间、巨大黑色块状字体、酸橙色涂鸦划线、贴纸徽章、时尚道具和玩具感 C4D 渲染。',
  },
  'bold-anime-reaction-thumbnail-style': {
    name: '高冲击动漫反应缩略图',
    summary:
      '适合社媒封面和视频缩略图：夸张动漫反应人物、黄色粗标题、强黑色阴影、分屏构图、小型发光展示区和干净赛璐璐上色。',
  },
  'electric-blue-silhouette-product-launch-style': {
    name: '电蓝剪影产品发布海报',
    summary:
      '高级消费科技发布感：黑色大留白、居中产品剪影、电蓝边缘光、发光平台、柔和倒影、巨大裁切背景字和简洁白色发布文案。',
  },
  'impact-burst-halftone-comic-poster-style': {
    name: '爆裂半调复古漫画海报',
    summary:
      '高能复古漫画海报：粗黑墨线、高饱和扁平色、巨大冲击字体、夸张插画主体、对角线道具、对话爆炸框、半调网点和丝网印刷颗粒。',
  },
  'luxury-perspective-checkerboard-editorial': {
    name: '奢华透视棋盘编辑海报',
    summary:
      '高定杂志广告感：低机位奢华摄影、红白棋盘透视平面、大量留白、夸张手写展示字，以及克制的祖母绿或青绿色点缀。',
  },
  'mono-noir-type-portrait-poster-style': {
    name: '黑白文字人像编辑海报',
    summary:
      '冷峻黑白编辑海报：近距离高对比摄影人像、巨大 lowercase 字体、一个词反白放进白色矩形标签，其余文字压在炭黑背景上。',
  },
  'neon-kinetic-typographic-poster-style': {
    name: '霓虹动感文字海报',
    summary:
      '户外青年文化海报感：低机位生活方式摄影、变形超大霓虹黄字体、胶片颗粒、强运动能量和活动宣传式排版。',
  },
  'plush-comic-toy-product-poster-style': {
    name: '毛绒漫画玩具产品海报',
    summary:
      '适合玩具和可爱产品：毛绒主角、复古奶油纸背景、青色圆形底、倾斜漫画字体、厚重黑影、涂鸦注释、贴纸标签和闪电图形。',
  },
  'rough-ink-music-doodle-poster-style': {
    name: '粗墨音乐涂鸦海报',
    summary:
      '手绘活动海报气质：粗糙深绿黑笔刷字、浅粉纸面、亮粉副标题、朴素吉祥物、青粉扁平色、黄色爆裂标记和 Risograph 扫描颗粒。',
  },
  'tokyo-kawaii-travel-collage-poster-style': {
    name: '东京可爱旅行拼贴海报',
    summary:
      '日系城市旅行拼贴：大胆目的地文字、可爱贴纸、漫画气泡、剪贴人物摄影、半调城市背景和手账杂志式密集版面。',
  },
  'tri-color-hardcut-portrait-poster-style': {
    name: '三色硬切人像海报',
    summary:
      '极简三色人像：青绿色背景、珊瑚红人物平面、近黑剪影或阴影，把细节压缩成大块硬边矢量切面。',
  },
  'y2k-grunge-hiphop-cutout-poster-style': {
    name: 'Y2K 脏感嘻哈剪贴海报',
    summary:
      '早千禧地下音乐杂志感：巨大照片剪贴、酸黄色复古字体、粗糙黑白墙面、密集编辑页脚和复印颗粒噪点。',
  },
}

function localizeStyleTemplate(style: StyleTemplate, locale: StyleTemplateLocale): StyleTemplate {
  if (locale === 'en') return { ...style, variables: [...style.variables] }
  const localized = STYLE_LOCALIZATIONS_ZH[style.slug]
  return localized
    ? {
        ...style,
        name: localized.name,
        summary: localized.summary,
        variables: [...style.variables],
      }
    : { ...style, variables: [...style.variables] }
}

export function listStyleTemplates(locale: StyleTemplateLocale = 'en'): StyleTemplate[] {
  return STYLE_TEMPLATES.map((style) => localizeStyleTemplate(style, locale))
}

export function styleBySlug(
  slug: string,
  locale: StyleTemplateLocale = 'en',
): StyleTemplate | undefined {
  const style = STYLE_TEMPLATES.find((s) => s.slug === slug)
  return style ? localizeStyleTemplate(style, locale) : undefined
}

export type Aspect = '16:9' | '9:16' | '1:1'

// Build a final image prompt from a style + the user's subject text.
export function applyStyle(style: StyleTemplate, subject: string, aspect: Aspect = '16:9'): string {
  const cleanSubject = subject.trim() || 'a striking original subject'
  const withCore = style.promptTemplate
    .replace(/\{ASPECT_RATIO\}/g, aspect)
    .replace(/\{SUBJECT\}/g, cleanSubject)

  // Per ". "-fragment: strip any remaining {VAR} tokens inline (so a sentence that also held
  // the subject keeps it), then drop fragments that collapsed to a bare "Label:" with no value.
  const kept = withCore
    .split('. ')
    .map((seg: string) =>
      seg
        .replace(/\{[A-Z_]+\}/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    // Drop empties, bare "Label:" leftovers, and tiny fragments left by stripped variables
    // (e.g. "Add", "with staged in") — but always keep the first sentence (style + aspect).
    .filter(
      (seg: string, i: number) => i === 0 || (seg.length > 8 && !/^[A-Za-z][\w/ -]*:$/.test(seg)),
    )

  return kept
    .join('. ')
    .replace(/\s+([.,])/g, '$1')
    .trim()
}
