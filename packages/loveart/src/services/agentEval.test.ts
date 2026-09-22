import { describe, expect, it } from 'vitest'
import { buildDefaultEvalChecks } from './agentEval'

describe('agent eval checks', () => {
  it('builds deterministic default checks for an image run', () => {
    const checks = buildDefaultEvalChecks({
      mode: 'image',
      hasRuntimeDate: true,
      hasVideoKnowledge: false,
      hasBranchModel: false,
    })

    expect(checks.map((check) => check.id)).toContain('runtime-date-context')
    expect(checks.map((check) => check.id)).toContain('prompt-optimization-gate')
    expect(checks.find((check) => check.id === 'image-no-video-knowledge')).toMatchObject({
      status: 'passed',
    })
  })
})
