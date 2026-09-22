import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AgentOrchestrationCard from './AgentOrchestrationCard'
import type { AgentOrchestrationMetadata } from '../types'

const metadata: AgentOrchestrationMetadata = {
  kind: 'agent_orchestration',
  scope: {
    scenario: 'image_generation',
    trigger: '生成海报',
    expectedOutput: 'image card',
    constraints: ['current request priority'],
  },
  evalChecks: [],
  diagnostics: [
    { id: 'context-overload', label: 'Context overload', status: 'warning', detail: '9000 chars' },
  ],
  loadedPolicies: ['core', 'runtime', 'image'],
  regressionChecks: [],
  stages: [
    {
      id: 'baseline_scope',
      status: 'done',
      title: 'Baseline Scope / 职责边界',
      summary: 'image_generation',
      details: ['image card'],
    },
    {
      id: 'eval_suite',
      status: 'done',
      title: 'Eval Suite / 评估基准',
      summary: '4 checks',
      details: [],
    },
    {
      id: 'root_cause_analysis',
      status: 'warning',
      title: 'Root Cause Analysis / 风险诊断',
      summary: '1 warning',
      details: ['9000 chars'],
    },
    {
      id: 'strategy_skills',
      status: 'done',
      title: 'Strategy as Skills / 策略技能加载',
      summary: 'core, runtime, image',
      details: [],
    },
    {
      id: 'regression',
      status: 'done',
      title: 'Regression / 回归检查',
      summary: '2 guardrails',
      details: [],
    },
  ],
}

describe('AgentOrchestrationCard', () => {
  it('renders all orchestration stages and warning details', () => {
    render(<AgentOrchestrationCard orchestration={metadata} />)

    expect(screen.getByText('Agent 编排流程')).toBeInTheDocument()
    expect(screen.getByText('Baseline Scope / 职责边界')).toBeInTheDocument()
    expect(screen.getByText('Root Cause Analysis / 风险诊断')).toBeInTheDocument()
    expect(screen.getByText('9000 chars')).toBeInTheDocument()
  })
})
