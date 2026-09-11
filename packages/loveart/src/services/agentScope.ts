export interface AgentScopeInput {
  prompt: string
  modeHint?: 'image' | 'video' | 'note'
  isBranch?: boolean
  hasReferences?: boolean
  hasOpenDesign?: boolean
}

export interface AgentScope {
  scenario:
    'image_generation' | 'video_generation' | 'branch_generation' | 'note' | 'mixed_generation'
  trigger: string
  expectedOutput: string
  constraints: string[]
}

export function classifyAgentScope(input: AgentScopeInput): AgentScope {
  const prompt = input.prompt.trim()
  const constraints = [
    'Current user request has highest priority.',
    'Runtime date and Settings language must be respected.',
  ]
  if (input.hasReferences) constraints.push('Preserve explicit reference intent.')
  if (input.hasOpenDesign) constraints.push('Apply selected Open Design context.')

  if (input.isBranch) {
    return {
      scenario: 'branch_generation',
      trigger: prompt,
      expectedOutput: 'branch target card',
      constraints,
    }
  }
  if (input.modeHint === 'video' || /视频|video|动画|animate/i.test(prompt)) {
    return {
      scenario: 'video_generation',
      trigger: prompt,
      expectedOutput: 'video card',
      constraints,
    }
  }
  if (input.modeHint === 'note') {
    return { scenario: 'note', trigger: prompt, expectedOutput: 'text note', constraints }
  }

  return {
    scenario: 'image_generation',
    trigger: prompt,
    expectedOutput: 'image card',
    constraints,
  }
}
