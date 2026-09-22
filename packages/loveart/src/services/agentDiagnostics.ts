import type { AgentDiagnostic } from '../types'

export interface AgentDiagnosticInput {
  systemMessages: string[]
  conversationMessages: string[]
  loadedPolicies: string[]
  modeSignals: string[]
}

export function diagnoseAgentRun(input: AgentDiagnosticInput): AgentDiagnostic[] {
  const totalChars = [...input.systemMessages, ...input.conversationMessages].join('\n').length
  const uniqueModes = new Set(input.modeSignals.filter(Boolean))

  return [
    {
      id: 'context-overload',
      label: 'Context overload',
      status: totalChars > 8000 ? 'warning' : 'passed',
      detail: `${totalChars} context characters across ${input.systemMessages.length} system messages and ${input.conversationMessages.length} conversation messages.`,
    },
    {
      id: 'policy-load',
      label: 'Policy load',
      status: input.loadedPolicies.length > 5 ? 'warning' : 'passed',
      detail: `${input.loadedPolicies.length} policies loaded: ${input.loadedPolicies.join(', ') || 'none'}.`,
    },
    {
      id: 'mode-conflict',
      label: 'Mode conflict',
      status: uniqueModes.size > 1 ? 'warning' : 'passed',
      detail:
        uniqueModes.size > 1
          ? `Conflicting mode signals: ${Array.from(uniqueModes).join(', ')}.`
          : 'No conflicting mode signals.',
    },
  ]
}
