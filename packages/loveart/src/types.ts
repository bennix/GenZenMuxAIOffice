// Shared types — see REQUIREMENTS.md §3 & §6

export type ModelCategory = 'image' | 'video' | 'chat'

export interface ModelEntry {
  id: string // e.g. "openai/gpt-image-2"
  name: string
  category: ModelCategory
  isDefault?: boolean // one default per category
}

export interface Project {
  id: string
  name: string
  createdAt: number
}

export type HumanSceneAspect = '16:9' | '9:16' | '1:1'
export type HumanScenePerspective = 'pseudo-3d'
export type HumanFigureLabel = 'Person A' | 'Person B' | 'Person C' | 'Person D'
export type HumanFigureFacing = 'left' | 'right' | 'front' | 'back' | 'toward-person'
export type HumanPosePreset =
  'standing' | 'sitting' | 'walking' | 'waving' | 'talking' | 'pointing' | 'turning'

export interface HumanFigureJoints {
  head: number
  torso: number
  leftArm: number
  rightArm: number
  leftElbow: number
  rightElbow: number
  leftLeg: number
  rightLeg: number
  leftKnee: number
  rightKnee: number
}

export interface HumanSceneStage {
  aspect: HumanSceneAspect
  perspective: HumanScenePerspective
}

export interface HumanFigure {
  id: string
  label: HumanFigureLabel
  x: number
  y: number
  zDepth: number
  scale: number
  facing: HumanFigureFacing
  facingTargetId?: string
  posePreset: HumanPosePreset
  joints: HumanFigureJoints
}

export interface HumanScene {
  id: string
  projectId: string
  name: string
  stage: HumanSceneStage
  people: HumanFigure[]
  createdAt: number
  updatedAt: number
}

export type CardType = 'image' | 'video' | 'note' | 'humanScene'
export type CardStatus = 'generating' | 'ready' | 'failed'

export interface Card {
  id: string
  projectId: string
  type: CardType
  status: CardStatus
  url?: string // remote https URL (used directly)
  assetId?: string // IndexedDB-backed binary blob; resolved to an object URL at render time
  prompt?: string
  model?: string
  text?: string // note cards
  humanSceneId?: string
  x: number
  y: number
  w: number
  h: number
  error?: string
}

export type Role = 'user' | 'assistant' | 'tool'

export interface PromptOptimizationAgentReview {
  agent: string
  focus: string
  finding: string
  improvement: string
  status: 'complete' | 'missing'
}

export interface PromptOptimizationMetadata {
  kind: 'prompt_optimization'
  userIntent: string
  strategySteps: string[]
  agentReviews: PromptOptimizationAgentReview[]
  intermediatePrompt: string
  finalPrompt: string
}

export type AgentOrchestrationStageId =
  'baseline_scope' | 'eval_suite' | 'root_cause_analysis' | 'strategy_skills' | 'regression'

export type AgentOrchestrationStatus = 'pending' | 'running' | 'done' | 'warning' | 'failed'

export type AgentEvalCheckKind =
  'exact_match' | 'tool_call' | 'state_check' | 'range_check' | 'llm_judge_placeholder'

export interface AgentEvalCheck {
  id: string
  kind: AgentEvalCheckKind
  label: string
  status: 'pending' | 'passed' | 'warning' | 'failed'
  expected: string
  actual?: string
}

export interface AgentDiagnostic {
  id: string
  label: string
  status: 'passed' | 'warning' | 'failed'
  detail: string
}

export interface AgentOrchestrationStage {
  id: AgentOrchestrationStageId
  status: AgentOrchestrationStatus
  title: string
  summary: string
  details: string[]
}

export interface AgentOrchestrationMetadata {
  kind: 'agent_orchestration'
  scope: {
    scenario: string
    trigger: string
    expectedOutput: string
    constraints: string[]
  }
  evalChecks: AgentEvalCheck[]
  diagnostics: AgentDiagnostic[]
  loadedPolicies: string[]
  regressionChecks: AgentEvalCheck[]
  stages: AgentOrchestrationStage[]
}

export interface Message {
  id: string
  projectId: string
  role: Role
  content: string
  metadata?: {
    promptOptimization?: PromptOptimizationMetadata
    orchestration?: AgentOrchestrationMetadata
  }
}

export type PlanStatus = 'pending' | 'running' | 'done' | 'failed'

export interface PlanStep {
  id: string
  projectId: string
  label: string
  status: PlanStatus
}

export interface CanvasViewport {
  x: number
  y: number
  scale: number
}

export type BranchOutputMode = 'image' | 'video'
export type CanvasEdgeStatus = 'draft' | 'generating' | 'ready' | 'failed'

export interface CanvasEdge {
  id: string
  projectId: string
  sourceCardId: string
  targetCardId?: string
  prompt: string
  outputMode: BranchOutputMode
  model?: string
  duration?: number
  useSourceAsReference: boolean
  humanSceneId?: string | null
  useHumanSceneReference?: boolean
  sourceAnchor: 'right' | 'bottom'
  targetX: number
  targetY: number
  status: CanvasEdgeStatus
  error?: string
}
