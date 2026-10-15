/** 'auto' is an explicit UI choice permitting a bundled target-language face. */
export function translationFont(
  choice: string | undefined,
  language: string,
  sourceFont: string,
): string | undefined {
  if (choice !== 'auto') return choice
  const target = language.trim().toLowerCase()
  if (/^(zh|chinese|中文|简体|繁体)/.test(target)) {
    if (/tw|hk|hant|繁/.test(target)) return 'noto-tc'
    return /roman|nimbusrom|times|serif|song|simsun|cmr|宋|明/i.test(sourceFont)
      ? 'noto-serif-sc'
      : 'noto-sc'
  }
  if (/^(ja|japanese|日)/.test(target)) return 'noto-jp'
  if (/^(ko|korean|韩|韓)/.test(target)) return 'noto-kr'
  return undefined
}

export function translationParagraph(text: string): string {
  return text
    .replace(/(\p{L})-\n(?=\p{L})/gu, '$1')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}
