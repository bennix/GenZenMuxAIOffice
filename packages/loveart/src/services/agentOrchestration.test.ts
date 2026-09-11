import { describe, expect, it } from 'vitest'
import { buildAgentOrchestration } from './agentOrchestration'

describe('agent orchestration metadata', () => {
  it('builds five visible orchestration stages', () => {
    const metadata = buildAgentOrchestration({
      prompt: '生成一张产品海报',
      modeHint: 'image',
      hasRuntimeDate: true,
      hasVideoKnowledge: false,
      hasBranchModel: false,
      hasOpenDesign: false,
      systemMessages: ['system'],
      conversationMessages: ['user'],
    })

    expect(metadata.kind).toBe('agent_orchestration')
    expect(metadata.stages.map((stage) => stage.id)).toEqual([
      'baseline_scope',
      'eval_suite',
      'root_cause_analysis',
      'strategy_skills',
      'regression',
    ])
    expect(metadata.loadedPolicies).toEqual(['core', 'runtime', 'image'])
  })
})
