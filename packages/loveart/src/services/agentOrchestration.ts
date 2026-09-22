import type { AgentOrchestrationMetadata, AgentOrchestrationStage } from '../types'
import { buildDefaultEvalChecks } from './agentEval'
import { classifyAgentScope } from './agentScope'
import { diagnoseAgentRun } from './agentDiagnostics'
import { selectAgentPolicies } from './agentPolicies'

export interface BuildAgentOrchestrationInput {
  prompt: string
  modeHint?: 'image' | 'video' | 'note'
  isBranch?: boolean
  hasReferences?: boolean
  hasOpenDesign?: boolean
  hasRuntimeDate: boolean
  hasVideoKnowledge: boolean
  hasBranchModel: boolean
  systemMessages: string[]
  conversationMessages: string[]
}

function statusFromWarnings(items: Array<{ status: string }>): 'done' | 'warning' | 'failed' {
  if (items.some((item) => item.status === 'failed')) return 'failed'
  if (items.some((item) => item.status === 'warning')) return 'warning'
  return 'done'
}

export function buildAgentOrchestration(
  input: BuildAgentOrchestrationInput,
): AgentOrchestrationMetadata {
  const scope = classifyAgentScope(input)
  const mode =
    scope.scenario === 'video_generation'
      ? 'video'
      : scope.scenario === 'branch_generation'
        ? 'branch'
        : scope.scenario === 'note'
          ? 'note'
          : 'image'
  const policies = selectAgentPolicies({
    mode,
    isBranch: input.isBranch,
    hasOpenDesign: input.hasOpenDesign,
    hasVideoKnowledge: input.hasVideoKnowledge,
  })
  const evalChecks = buildDefaultEvalChecks({
    mode,
    hasRuntimeDate: input.hasRuntimeDate,
    hasVideoKnowledge: input.hasVideoKnowledge,
    hasBranchModel: input.hasBranchModel,
  })
  const diagnostics = diagnoseAgentRun({
    systemMessages: input.systemMessages,
    conversationMessages: input.conversationMessages,
    loadedPolicies: policies.map((policy) => policy.id),
    modeSignals: [input.modeHint, input.hasVideoKnowledge ? 'video' : ''].filter(
      Boolean,
    ) as string[],
  })
  const regressionChecks = evalChecks.filter((check) =>
    ['prompt-optimization-gate', 'branch-model-captured'].includes(check.id),
  )

  const stages: AgentOrchestrationStage[] = [
    {
      id: 'baseline_scope',
      status: 'done',
      title: 'Baseline Scope / 职责边界',
      summary: `${scope.scenario} -> ${scope.expectedOutput}`,
      details: scope.constraints,
    },
    {
      id: 'eval_suite',
      status: statusFromWarnings(evalChecks),
      title: 'Eval Suite / 评估基准',
      summary: `${evalChecks.length} deterministic checks prepared`,
      details: evalChecks.map((check) => `${check.label}: ${check.status}`),
    },
    {
      id: 'root_cause_analysis',
      status: statusFromWarnings(diagnostics),
      title: 'Root Cause Analysis / 风险诊断',
      summary: `${diagnostics.length} diagnostics completed`,
      details: diagnostics.map((item) => `${item.label}: ${item.detail}`),
    },
    {
      id: 'strategy_skills',
      status: 'done',
      title: 'Strategy as Skills / 策略技能加载',
      summary: policies.map((policy) => policy.id).join(', '),
      details: policies.map((policy) => policy.title),
    },
    {
      id: 'regression',
      status: statusFromWarnings(regressionChecks),
      title: 'Regression / 回归检查',
      summary: `${regressionChecks.length} guardrails active`,
      details: regressionChecks.map((check) => `${check.label}: ${check.status}`),
    },
  ]

  return {
    kind: 'agent_orchestration',
    scope,
    evalChecks,
    diagnostics,
    loadedPolicies: policies.map((policy) => policy.id),
    regressionChecks,
    stages,
  }
}
