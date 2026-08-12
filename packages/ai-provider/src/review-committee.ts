import { ZENMUX_MODELS } from './providers'
import type { AiSettings } from './types'

export type ReviewLanguage = 'zh' | 'en'

export interface ReviewProfile {
  id: string
  labelZh: string
  labelEn: string
  criteria: string
  verdictScale: string
  members: Array<{ roleZh: string; roleEn: string; focus: string }>
}

const academicMembers = [
  {
    roleZh: '创新性与影响力委员',
    roleEn: 'Novelty & Impact Reviewer',
    focus:
      'novelty, significance, positioning against prior work, and whether the claims meet the venue bar',
  },
  {
    roleZh: '方法与统计委员',
    roleEn: 'Methods & Statistics Reviewer',
    focus:
      'methodological correctness, experimental design, statistics, controls, robustness, and reproducibility',
  },
  {
    roleZh: '证据与表达委员',
    roleEn: 'Evidence & Presentation Reviewer',
    focus:
      'claim-evidence alignment, missing evidence, figures/tables, writing, ethics, limitations, and data availability',
  },
]
const ieeeMembers = [
  {
    roleZh: '技术创新委员',
    roleEn: 'Technical Novelty Reviewer',
    focus:
      'technical novelty, correctness, theoretical contribution, relevance to IEEE scope, and comparison with state of the art',
  },
  {
    roleZh: '实验验证委员',
    roleEn: 'Experimental Validation Reviewer',
    focus:
      'benchmarks, baselines, ablations, statistics, complexity, reproducibility, and threats to validity',
  },
  {
    roleZh: '论文质量委员',
    roleEn: 'Paper Quality Reviewer',
    focus:
      'clarity, organization, figures, equations, references, standards compliance, ethics, and actionable revision quality',
  },
]
const proposalMembers = [
  {
    roleZh: '战略价值委员',
    roleEn: 'Strategic Value Reviewer',
    focus:
      'strategic fit, necessity, expected impact, measurable objectives, and differentiation from existing work',
  },
  {
    roleZh: '技术可行性委员',
    roleEn: 'Technical Feasibility Reviewer',
    focus:
      'technical route, innovation, milestones, validation plan, dependencies, and implementation feasibility',
  },
  {
    roleZh: '执行与风险委员',
    roleEn: 'Execution & Risk Reviewer',
    focus:
      'team capability, budget, schedule, deliverables, governance, compliance, and risk mitigation',
  },
]
const bidMembers = [
  {
    roleZh: '合规响应委员',
    roleEn: 'Compliance Reviewer',
    focus:
      'requirement coverage, mandatory clauses, qualification evidence, completeness, and disqualification risks',
  },
  {
    roleZh: '技术方案委员',
    roleEn: 'Technical Solution Reviewer',
    focus:
      'solution architecture, delivery plan, performance commitments, acceptance criteria, and operational feasibility',
  },
  {
    roleZh: '商务与风险委员',
    roleEn: 'Commercial & Risk Reviewer',
    focus:
      'pricing logic, commercial terms, schedule, resources, warranties, liabilities, and competitive differentiation',
  },
]

export const REVIEW_PROFILES: ReviewProfile[] = [
  {
    id: 'science',
    labelZh: 'Science 级期刊',
    labelEn: 'Science-level Journal',
    criteria:
      'broad scientific importance, conceptual breakthrough, exceptional evidence, and cross-disciplinary interest',
    verdictScale:
      'Reject / Major revision before resubmission / Potentially competitive / Strong candidate',
    members: academicMembers,
  },
  {
    id: 'nature',
    labelZh: 'Nature 级期刊',
    labelEn: 'Nature-level Journal',
    criteria:
      'outstanding novelty, fundamental importance, broad readership, decisive evidence, and editorial priority',
    verdictScale:
      'Reject / Major revision before resubmission / Potentially competitive / Strong candidate',
    members: academicMembers,
  },
  {
    id: 'cell',
    labelZh: 'Cell 级期刊',
    labelEn: 'Cell-level Journal',
    criteria:
      'transformative biological insight, mechanistic depth, completeness, general interest, and rigorous validation',
    verdictScale:
      'Reject / Major revision before resubmission / Potentially competitive / Strong candidate',
    members: academicMembers,
  },
  {
    id: 'elsevier',
    labelZh: 'Elsevier 期刊',
    labelEn: 'Elsevier Journal',
    criteria:
      'journal fit, sound novelty, methodological rigor, complete reporting, research integrity, and publishable presentation',
    verdictScale: 'Reject / Major revision / Minor revision / Accept',
    members: academicMembers,
  },
  {
    id: 'ieee-top-journal',
    labelZh: 'IEEE 顶刊',
    labelEn: 'Top IEEE Journal',
    criteria:
      'substantial technical contribution, archival depth, rigorous theory and experiments, reproducibility, and field impact',
    verdictScale: 'Reject / Major revision / Minor revision / Accept',
    members: ieeeMembers,
  },
  {
    id: 'ieee-top-conference',
    labelZh: 'IEEE 顶级会议',
    labelEn: 'Top IEEE Conference',
    criteria:
      'clear novelty, technical correctness, strong empirical evidence, timeliness, concise presentation, and competitive significance',
    verdictScale: 'Strong reject / Reject / Borderline / Accept / Strong accept',
    members: ieeeMembers,
  },
  {
    id: 'ieee-conference',
    labelZh: 'IEEE 一般会议',
    labelEn: 'General IEEE Conference',
    criteria:
      'technical soundness, adequate novelty, relevant experiments, clear presentation, and conference scope fit',
    verdictScale: 'Reject / Weak reject / Weak accept / Accept',
    members: ieeeMembers,
  },
  {
    id: 'nsfc',
    labelZh: '国家自然科学基金标书',
    labelEn: 'NSFC Proposal',
    criteria:
      'scientific question, originality, research basis, feasible technical route, annual plan, expected outputs, and funding justification',
    verdictScale: 'Not recommended / Revise substantially / Competitive / Highly recommended',
    members: proposalMembers,
  },
  {
    id: '863',
    labelZh: '863 项目标书',
    labelEn: '863 Program Proposal',
    criteria:
      'national strategic relevance, key technology breakthroughs, engineering feasibility, milestones, industrialization path, and risk control',
    verdictScale: 'Not recommended / Revise substantially / Competitive / Highly recommended',
    members: proposalMembers,
  },
  {
    id: 'technology-proposal',
    labelZh: '科技项目标书',
    labelEn: 'Technology Project Proposal',
    criteria:
      'policy fit, innovation, technical feasibility, quantified targets, implementation plan, budget, benefits, and acceptance evidence',
    verdictScale: 'Not recommended / Revise substantially / Competitive / Highly recommended',
    members: proposalMembers,
  },
  {
    id: 'commercial-bid',
    labelZh: '商业标书',
    labelEn: 'Commercial Bid',
    criteria:
      'buyer requirement coverage, persuasive value proposition, delivery credibility, pricing, contractual risk, and competitive differentiation',
    verdictScale: 'Non-compliant / Weak / Competitive / Strongly recommended',
    members: bidMembers,
  },
]

export function availableReviewModels(settings: AiSettings): string[] {
  const config = settings.providers.zenmux
  return [...new Set([...(config.models ?? []), config.model, ...ZENMUX_MODELS].filter(Boolean))]
}

export function assignReviewModels(
  models: string[],
  count: number,
  random: () => number = Math.random,
): string[] {
  if (!models.length || count <= 0) return []
  const shuffled = [...new Set(models)]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return Array.from({ length: count }, (_, index) => shuffled[index % shuffled.length]!)
}

export function settingsForReviewModel(settings: AiSettings, model: string): AiSettings {
  return {
    ...settings,
    provider: 'zenmux',
    providers: { ...settings.providers, zenmux: { ...settings.providers.zenmux, model } },
  }
}

export function reviewerSystemPrompt(
  profile: ReviewProfile,
  member: ReviewProfile['members'][number],
  language: ReviewLanguage,
): string {
  const outputLanguage = language === 'zh' ? 'Simplified Chinese' : 'English'
  return `You are the ${member.roleEn} on a strict ${profile.labelEn} review committee. Your assigned focus is ${member.focus}. The venue-specific bar is: ${profile.criteria}.\n\nReview only the supplied document. Inspect its text, Markdown structure, LaTeX formulas, tables, images, charts, diagrams, and Mermaid source/rendering evidence. Explicitly disclose anything you could not assess. Do not invent experiments, citations, requirements, or facts. Separate fatal flaws from fixable issues and cite the relevant section, claim, table, figure, diagram, or equation whenever possible. Be demanding, specific, and constructive; do not rewrite the document.\n\nWrite entirely in ${outputLanguage}, using Markdown with exactly these sections:\n1. Summary and contribution\n2. Strengths\n3. Critical concerns\n4. Major revisions required\n5. Minor comments\n6. Questions for the authors/applicant\n7. Independent verdict (${profile.verdictScale}) and confidence (1-5)`
}

export function chairSystemPrompt(profile: ReviewProfile, language: ReviewLanguage): string {
  const outputLanguage = language === 'zh' ? 'Simplified Chinese' : 'English'
  return `You are the chair of a strict ${profile.labelEn} review committee. Synthesize the independent reviews without hiding disagreement. Do not add claims that are absent from the document or reviews.\n\nWrite entirely in ${outputLanguage}, using Markdown with these sections:\n1. Committee decision (${profile.verdictScale})\n2. Executive assessment\n3. Consensus strengths\n4. Blocking issues\n5. Prioritized revision checklist\n6. Reviewer disagreements and chair resolution\n7. Readiness score (0-100) with a one-sentence justification`
}
