import type { ToneFinding, ToneSegment } from './less-ai-tone'

export const TONE_PROFILES = {
  conservative: { label: '保守校订（原有 11 条规则）', instruction: '' },
  chinese: {
    label: '中文自然表达',
    instruction: '额外关注无用开场、职场术语堆砌、空泛拔高和模糊归因，分别归入规则9、8、8、10。参考 no-ai-slop-zh 的最小有效修改原则。仅当上下文确实空泛才提出修改；保留专业术语的准确用法、作者声音和不确定性。缺少来源时保留主张供用户核实，不编造出处或删除实质主张。',
  },
  english: {
    label: '英文简洁表达',
    instruction: '允许处理英文正文，关注 formulaic openers、inflated register、empty grandiosity，分别归入规则9、10、8。优先清楚自然的动词；不一律删除副词、被动语态或学术术语，不编造个人经历。',
  },
} as const
export type ToneProfile = keyof typeof TONE_PROFILES

/** Deliberately small, explainable style cues; these are not authorship classifiers. */
export function scanToneOffline(segments: ToneSegment[], profile: ToneProfile): ToneFinding[] {
  const patterns: [number, RegExp][] = [
    [9, /说白了[，,]?|值得一提的是[，,]?|毋庸置疑[，,]?|不言而喻[，,]?/g],
    [1, /不是[^。！？\n]{1,35}[，,]而是/g],
  ]
  if (profile === 'chinese') patterns.push(
    [9, /在当今时代|很多人不知道的是|真正的关键在于|不可否认的是/g],
    [8, /赋能|底层逻辑|顶层设计|全链路|飞轮效应|降维打击|具有深远的意义|里程碑式/g],
    [10, /专家表示|业内人士指出|有观点认为/g],
  )
  if (profile === 'english') patterns.push(
    [9, /\b(?:in (?:an|the) era of|it is worth noting that|it should be noted that)\b/gi],
    [10, /\b(?:delve into|tapestry of|at this juncture|in regards to)\b/gi],
    [8, /\b(?:paradigm shift|game[ -]changer|unprecedented synergy)\b/gi],
  )
  const findings: ToneFinding[] = []
  for (const segment of segments) {
    for (const [rule, pattern] of patterns) {
      for (const match of segment.text.matchAll(pattern))
        findings.push({ id: segment.id, rule, quote: match[0], offset: match.index })
    }
    const dashes = [...segment.text.matchAll(/—+|–/g)]
    if (dashes.length >= 3)
      for (const match of dashes)
        findings.push({ id: segment.id, rule: 4, quote: match[0], offset: match.index })
  }
  return findings
}
