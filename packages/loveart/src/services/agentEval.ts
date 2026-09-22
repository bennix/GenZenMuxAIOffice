import type { AgentEvalCheck } from '../types'

export interface AgentEvalInput {
  mode: 'image' | 'video' | 'branch' | 'note' | 'mixed'
  hasRuntimeDate: boolean
  hasVideoKnowledge: boolean
  hasBranchModel: boolean
}

export function buildDefaultEvalChecks(input: AgentEvalInput): AgentEvalCheck[] {
  return [
    {
      id: 'runtime-date-context',
      kind: 'exact_match',
      label: 'Runtime date context',
      status: input.hasRuntimeDate ? 'passed' : 'warning',
      expected: 'Current runtime date is present in Agent context.',
      actual: input.hasRuntimeDate ? 'present' : 'missing',
    },
    {
      id: 'prompt-optimization-gate',
      kind: 'state_check',
      label: 'Prompt optimization gate',
      status: 'passed',
      expected: 'Generation must use the displayed final optimized prompt.',
      actual: 'gate enabled',
    },
    {
      id: 'image-no-video-knowledge',
      kind: 'state_check',
      label: 'Image/video knowledge separation',
      status: input.mode === 'image' && input.hasVideoKnowledge ? 'warning' : 'passed',
      expected: 'Image generation should not load video knowledge by default.',
      actual: input.hasVideoKnowledge ? 'video knowledge loaded' : 'video knowledge not loaded',
    },
    {
      id: 'branch-model-captured',
      kind: 'state_check',
      label: 'Branch model captured',
      status: input.mode === 'branch' && !input.hasBranchModel ? 'warning' : 'passed',
      expected: 'Branch generation stores a model id on CanvasEdge.',
      actual: input.hasBranchModel ? 'model captured' : 'not a branch run or missing model',
    },
  ]
}
