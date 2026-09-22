export interface AgentPolicyInput {
  mode: 'image' | 'video' | 'branch' | 'note' | 'mixed'
  isBranch?: boolean
  hasOpenDesign?: boolean
  hasVideoKnowledge?: boolean
}

export interface AgentPolicy {
  id: string
  title: string
  build: () => string
}

const policies: Record<string, AgentPolicy> = {
  core: {
    id: 'core',
    title: 'Core orchestration policy',
    build: () =>
      'Use the visible plan, prompt optimization gate, and exact final prompt for generation.',
  },
  runtime: {
    id: 'runtime',
    title: 'Runtime date and language policy',
    build: () => 'Respect current runtime date, current year, and Settings language.',
  },
  image: {
    id: 'image',
    title: 'Image generation policy',
    build: () =>
      'For images, specify subject, composition, palette, typography, lighting, texture, and avoid-list.',
  },
  video: {
    id: 'video',
    title: 'Video generation policy',
    build: () =>
      'For videos, specify moving subject, causality, camera, lighting, rhythm, and final state.',
  },
  branch: {
    id: 'branch',
    title: 'Branch generation policy',
    build: () =>
      'For branches, preserve source-card intent while applying only the requested delta.',
  },
  'open-design': {
    id: 'open-design',
    title: 'Open Design policy',
    build: () =>
      'Apply selected design system and template constraints as internal generation context.',
  },
}

export function selectAgentPolicies(input: AgentPolicyInput): AgentPolicy[] {
  const selected = [policies.core, policies.runtime]
  if (input.mode === 'image' || input.mode === 'branch' || input.mode === 'mixed')
    selected.push(policies.image)
  if (input.mode === 'video' || input.hasVideoKnowledge) selected.push(policies.video)
  if (input.isBranch || input.mode === 'branch') selected.push(policies.branch)
  if (input.hasOpenDesign) selected.push(policies['open-design'])
  return selected
}

export function buildPolicyContext(input: AgentPolicyInput): string {
  return selectAgentPolicies(input)
    .map((policy) => `Policy: ${policy.title}\n${policy.build()}`)
    .join('\n\n')
}
