import type { AiImageReference, AiSettings } from './types'

export const ZENMUX_FORMULA_MODEL = 'z-ai/glm-5v-turbo'

export const FORMULA_RECOGNITION_SYSTEM =
  'You are a mathematical OCR engine. Transcribe the formula in the supplied image into LaTeX. Return only the LaTeX source, without Markdown fences, dollar delimiters, prose, or explanation. Preserve fractions, roots, scripts, matrices, integrals, sums, Greek letters, accents, line breaks, alignment, cases, and equation arrays. For multi-line formulas, use an appropriate LaTeX environment such as aligned, gathered, cases, or a matrix and preserve \\\\ row separators. Do not flatten multiple lines and do not invent surrounding prose.'

export const FORMULA_RECOGNITION_USER =
  'Recognize the mathematical formula in this image and return only editable LaTeX.'

/** Use ZenMux's configured credentials while selecting the suite's vision model. */
export function formulaRecognitionSettings(settings: AiSettings): AiSettings {
  return {
    ...settings,
    provider: 'zenmux',
    providers: {
      ...settings.providers,
      zenmux: { ...settings.providers.zenmux, model: ZENMUX_FORMULA_MODEL },
    },
  }
}

/** Remove wrappers that multimodal models sometimes add despite the strict prompt. */
export function cleanRecognizedLatex(content: string): string {
  let value = content.trim()
  const fenced = /^```(?:latex|tex)?\s*([\s\S]*?)\s*```$/i.exec(value)
  if (fenced?.[1]) value = fenced[1].trim()
  if (value.startsWith('$$') && value.endsWith('$$') && value.length > 4) {
    value = value.slice(2, -2).trim()
  } else if (value.startsWith('$') && value.endsWith('$') && value.length > 2) {
    value = value.slice(1, -1).trim()
  } else if (value.startsWith('\\[') && value.endsWith('\\]')) {
    value = value.slice(2, -2).trim()
  } else if (value.startsWith('\\(') && value.endsWith('\\)')) {
    value = value.slice(2, -2).trim()
  }
  return value
}

export function formulaRecognitionRequest(settings: AiSettings, image: AiImageReference) {
  return {
    settings: formulaRecognitionSettings(settings),
    system: FORMULA_RECOGNITION_SYSTEM,
    user: FORMULA_RECOGNITION_USER,
    images: [image],
  }
}
