import { describe, expect, it } from 'vitest'
import { diagnoseAgentRun } from './agentDiagnostics'

describe('agent diagnostics', () => {
  it('warns on large context', () => {
    const diagnostics = diagnoseAgentRun({
      systemMessages: ['x'.repeat(9000)],
      conversationMessages: [],
      loadedPolicies: ['core', 'runtime', 'image'],
      modeSignals: ['image'],
    })

    expect(diagnostics.find((item) => item.id === 'context-overload')).toMatchObject({
      status: 'warning',
    })
  })

  it('warns on conflicting mode signals', () => {
    const diagnostics = diagnoseAgentRun({
      systemMessages: [],
      conversationMessages: [],
      loadedPolicies: ['core', 'runtime', 'image', 'video'],
      modeSignals: ['image', 'video'],
    })

    expect(diagnostics.find((item) => item.id === 'mode-conflict')).toMatchObject({
      status: 'warning',
    })
  })
})
