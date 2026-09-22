import { ZENMUX_MODELS } from './providers'
import type { AiSettings } from './types'
import { languageEnglishName, type Lang } from '@genoffice/i18n'

export type ReviewLanguage = Lang

export interface ReviewProfile {
  id: string
  labelZh: string
  labelEn: string
  category: 'academic' | 'proposal' | 'bid' | 'composition'
  criteria: string
  verdictScale: string
  members: Array<{
    roleZh: string
    roleEn: string
    focus: string
    literatureReviewer?: boolean
  }>
}

const academicMembers = [
  {
    roleZh: '创新性与影响力委员',
    roleEn: 'Novelty & Impact Reviewer',
    literatureReviewer: true,
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

const compositionMembers = [
  {
    roleZh: '立意与内容评委',
    roleEn: 'Ideas & Content Assessor',
    focus:
      'task fulfilment, originality, depth of ideas, relevance, evidence, audience awareness, and factual consistency',
  },
  {
    roleZh: '结构与逻辑评委',
    roleEn: 'Structure & Reasoning Assessor',
    focus:
      'organization, paragraph progression, coherence, transitions, argument development, pacing, and conclusion quality',
  },
  {
    roleZh: '语言与文风评委',
    roleEn: 'Language & Style Assessor',
    focus:
      'grammar, vocabulary, sentence variety, idiomatic expression, register, rhetoric, mechanics, and authentic authorial voice',
  },
]

export const REVIEW_PROFILES: ReviewProfile[] = [
  {
    id: 'science',
    labelZh: 'Science 级期刊',
    labelEn: 'Science-level Journal',
    category: 'academic',
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
    category: 'academic',
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
    category: 'academic',
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
    category: 'academic',
    criteria:
      'journal fit, sound novelty, methodological rigor, complete reporting, research integrity, and publishable presentation',
    verdictScale: 'Reject / Major revision / Minor revision / Accept',
    members: academicMembers,
  },
  {
    id: 'ieee-top-journal',
    labelZh: 'IEEE 顶刊',
    labelEn: 'Top IEEE Journal',
    category: 'academic',
    criteria:
      'substantial technical contribution, archival depth, rigorous theory and experiments, reproducibility, and field impact',
    verdictScale: 'Reject / Major revision / Minor revision / Accept',
    members: ieeeMembers,
  },
  {
    id: 'ieee-top-conference',
    labelZh: 'IEEE 顶级会议',
    labelEn: 'Top IEEE Conference',
    category: 'academic',
    criteria:
      'clear novelty, technical correctness, strong empirical evidence, timeliness, concise presentation, and competitive significance',
    verdictScale: 'Strong reject / Reject / Borderline / Accept / Strong accept',
    members: ieeeMembers,
  },
  {
    id: 'ieee-conference',
    labelZh: 'IEEE 一般会议',
    labelEn: 'General IEEE Conference',
    category: 'academic',
    criteria:
      'technical soundness, adequate novelty, relevant experiments, clear presentation, and conference scope fit',
    verdictScale: 'Reject / Weak reject / Weak accept / Accept',
    members: ieeeMembers,
  },
  {
    id: 'nsfc',
    labelZh: '国家自然科学基金标书',
    labelEn: 'NSFC Proposal',
    category: 'proposal',
    criteria:
      'scientific question, originality, research basis, feasible technical route, annual plan, expected outputs, and funding justification',
    verdictScale: 'Not recommended / Revise substantially / Competitive / Highly recommended',
    members: proposalMembers,
  },
  {
    id: '863',
    labelZh: '863 项目标书',
    labelEn: '863 Program Proposal',
    category: 'proposal',
    criteria:
      'national strategic relevance, key technology breakthroughs, engineering feasibility, milestones, industrialization path, and risk control',
    verdictScale: 'Not recommended / Revise substantially / Competitive / Highly recommended',
    members: proposalMembers,
  },
  {
    id: 'technology-proposal',
    labelZh: '科技项目标书',
    labelEn: 'Technology Project Proposal',
    category: 'proposal',
    criteria:
      'policy fit, innovation, technical feasibility, quantified targets, implementation plan, budget, benefits, and acceptance evidence',
    verdictScale: 'Not recommended / Revise substantially / Competitive / Highly recommended',
    members: proposalMembers,
  },
  {
    id: 'commercial-bid',
    labelZh: '商业标书',
    labelEn: 'Commercial Bid',
    category: 'bid',
    criteria:
      'buyer requirement coverage, persuasive value proposition, delivery credibility, pricing, contractual risk, and competitive differentiation',
    verdictScale: 'Non-compliant / Weak / Competitive / Strongly recommended',
    members: bidMembers,
  },
  {
    id: 'zhongkao-composition',
    labelZh: '中考中文作文',
    labelEn: 'Chinese High-school Entrance Essay',
    category: 'composition',
    criteria:
      'Chinese high-school entrance examination rubric: accurate task response, clear central idea, concrete content, coherent structure, fluent standard Chinese, and age-appropriate authentic expression',
    verdictScale: 'Needs major work / Developing / Good / Excellent',
    members: compositionMembers,
  },
  {
    id: 'gaokao-composition',
    labelZh: '高考中文作文',
    labelEn: 'Chinese College-entrance Essay',
    category: 'composition',
    criteria:
      'Chinese college entrance examination rubric: precise interpretation of the prompt, intellectual depth, rich and credible material, rigorous structure, expressive language, and stylistic maturity',
    verdictScale: 'Below standard / Pass / Strong / Outstanding',
    members: compositionMembers,
  },
  {
    id: 'chinese-competition-composition',
    labelZh: '中文作文竞赛',
    labelEn: 'Chinese Writing Competition',
    category: 'composition',
    criteria:
      'competition-level originality, insight, narrative or argumentative control, memorable imagery, linguistic distinction, structural ambition, and a coherent personal voice',
    verdictScale: 'Not competitive / Promising / Finalist quality / Award quality',
    members: compositionMembers,
  },
  {
    id: 'university-chinese-composition',
    labelZh: '大学中文写作',
    labelEn: 'University Chinese Writing',
    category: 'composition',
    criteria:
      'university-level critical thinking, evidence and reasoning, disciplinary awareness, coherent academic or creative structure, precise Chinese, and responsible citation where applicable',
    verdictScale: 'Needs major work / Pass / Good / Excellent',
    members: compositionMembers,
  },
  {
    id: 'middle-school-english-composition',
    labelZh: '初中英语作文',
    labelEn: 'Middle-school English Essay',
    category: 'composition',
    criteria:
      'age-appropriate task completion, clear basic organization, correct core grammar, usable vocabulary, sentence clarity, spelling, and communicative effectiveness',
    verdictScale: 'Needs major work / Developing / Good / Excellent',
    members: compositionMembers,
  },
  {
    id: 'high-school-english-composition',
    labelZh: '高中英语作文',
    labelEn: 'High-school English Essay',
    category: 'composition',
    criteria:
      'task achievement, logical organization, grammatical range and accuracy, lexical variety, cohesion, appropriate register, and natural English at upper-secondary level',
    verdictScale: 'Needs major work / Developing / Good / Excellent',
    members: compositionMembers,
  },
  {
    id: 'cet4-writing',
    labelZh: 'CET4 英语作文',
    labelEn: 'CET-4 Writing',
    category: 'composition',
    criteria:
      'CET-4 task fulfilment, relevance, organization, grammatical control, practical vocabulary, cohesion, and clarity under examination conditions',
    verdictScale: 'Below pass / Pass / Good / Excellent',
    members: compositionMembers,
  },
  {
    id: 'cet6-writing',
    labelZh: 'CET6 英语作文',
    labelEn: 'CET-6 Writing',
    category: 'composition',
    criteria:
      'CET-6 task fulfilment, analytical depth, coherent argument, grammatical range and accuracy, lexical sophistication, cohesion, and concise academic register',
    verdictScale: 'Below pass / Pass / Good / Excellent',
    members: compositionMembers,
  },
  {
    id: 'toefl-writing',
    labelZh: '托福写作',
    labelEn: 'TOEFL Writing',
    category: 'composition',
    criteria:
      'current TOEFL writing expectations: task completion, accurate source integration when supplied, idea development, organization, language use, grammatical accuracy, and concise academic expression',
    verdictScale: 'TOEFL 0-5 analytical score with an estimated performance band',
    members: compositionMembers,
  },
  {
    id: 'ielts-writing',
    labelZh: '雅思写作',
    labelEn: 'IELTS Writing',
    category: 'composition',
    criteria:
      'IELTS criteria: task achievement or response, coherence and cohesion, lexical resource, grammatical range and accuracy; distinguish Task 1 from Task 2 when the prompt is available',
    verdictScale: 'IELTS band 0-9 with half-band precision',
    members: compositionMembers,
  },
  {
    id: 'gre-writing',
    labelZh: 'GRE Analytical Writing',
    labelEn: 'GRE Analytical Writing',
    category: 'composition',
    criteria:
      'GRE analytical writing expectations: clear position, cogent reasons, relevant evidence, logical development, organization, command of standard written English, and nuanced engagement with the issue',
    verdictScale: 'GRE Analytical Writing 0-6 with half-point precision',
    members: compositionMembers,
  },
]

export function isCompositionProfile(profile: ReviewProfile): boolean {
  return profile.category === 'composition'
}

export function supportsLiteratureReview(profile: ReviewProfile): boolean {
  return profile.category === 'academic'
}

export function noveltyQuerySystemPrompt(language: ReviewLanguage): string {
  const outputLanguage = languageEnglishName(language)
  return `You prepare scholarly database queries for a novelty reviewer. From the supplied manuscript, identify its central claimed contribution, method, task/domain, and closest likely prior-work concepts. Return JSON only in the form {"queries":["...","...","..."]}. Produce 2-3 concise, discriminating search queries suitable for OpenAlex, Crossref, Semantic Scholar, PubMed, and arXiv. Queries may use English technical terms even when the report language is ${outputLanguage}. Do not assess novelty and do not invent a title, method, result, DOI, or citation.`
}

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
  const outputLanguage = languageEnglishName(language)
  if (isCompositionProfile(profile)) {
    return `You are the ${member.roleEn} on a demanding ${profile.labelEn} writing assessment panel. Your assigned focus is ${member.focus}. Apply this rubric: ${profile.criteria}.

Assess only the supplied essay and prompt, if present. Never invent a missing prompt, source, fact, or author intention. Quote short, exact excerpts when diagnosing problems. Calibrate expectations to the selected learner/exam level; do not penalize age-appropriate language for lacking postgraduate sophistication. Be rigorous, encouraging, and actionable.

Write commentary entirely in ${outputLanguage}; quoted excerpts and suggested corrections must remain in the essay's original language. Use Markdown with exactly these sections:
1. Task understanding and overall assessment
2. What works well
3. Priority problems with quoted evidence
4. Structure and reasoning
5. Language corrections (original -> suggested -> reason)
6. Revision plan
7. Independent score (${profile.verdictScale}) and confidence (1-5)`
  }
  const literatureInstruction = member.literatureReviewer
    ? '\n\nWhen LIVE SCHOLARLY METADATA EVIDENCE is supplied, use it to test positioning and innovation claims. Compare only what titles/abstracts/metadata support; cite DOI or stable URL for every external comparison, distinguish preprints, and report search gaps. Absence from the search results is not evidence of novelty. If no live evidence is supplied, explicitly say that external novelty was not verified.'
    : ''
  return `You are the ${member.roleEn} on a strict ${profile.labelEn} review committee. Your assigned focus is ${member.focus}. The venue-specific bar is: ${profile.criteria}.\n\nReview only the supplied document. Inspect its text, Markdown structure, LaTeX formulas, tables, images, charts, diagrams, and Mermaid source/rendering evidence. Explicitly disclose anything you could not assess. Do not invent experiments, citations, requirements, or facts. Separate fatal flaws from fixable issues and cite the relevant section, claim, table, figure, diagram, or equation whenever possible. Be demanding, specific, and constructive; do not rewrite the document.${literatureInstruction}\n\nWrite entirely in ${outputLanguage}, using Markdown with exactly these sections:\n1. Summary and contribution\n2. Strengths\n3. Critical concerns\n4. Major revisions required\n5. Minor comments\n6. Questions for the authors/applicant\n7. Independent verdict (${profile.verdictScale}) and confidence (1-5)`
}

export function chairSystemPrompt(profile: ReviewProfile, language: ReviewLanguage): string {
  const outputLanguage = languageEnglishName(language)
  if (isCompositionProfile(profile)) {
    return `You are the chair of a ${profile.labelEn} writing assessment panel. Reconcile the three independent assessments and produce a fair, level-calibrated final result. Do not invent a prompt, sources, facts, or personal experiences. Preserve the author's intended meaning and authentic voice in the revision.

Write commentary entirely in ${outputLanguage}, but write the polished essay in the same language as the original essay. Use Markdown with exactly these sections:
1. Final score (${profile.verdictScale})
2. One-paragraph examiner assessment
3. Score breakdown by content, structure, and language
4. Top three improvements
5. Sentence-level correction table
6. Polished version (complete essay, preserving meaning and appropriate length)
7. Next-practice checklist`
  }
  return `You are the chair of a strict ${profile.labelEn} review committee. Synthesize the independent reviews without hiding disagreement. Do not add claims that are absent from the document or reviews.\n\nWrite entirely in ${outputLanguage}, using Markdown with these sections:\n1. Committee decision (${profile.verdictScale})\n2. Executive assessment\n3. Consensus strengths\n4. Blocking issues\n5. Prioritized revision checklist\n6. Reviewer disagreements and chair resolution\n7. Readiness score (0-100) with a one-sentence justification`
}
