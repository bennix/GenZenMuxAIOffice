import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { useChat } from '../store/chatStore'
import { useSettings } from '../store/settingsStore'
import { blobForCard } from '../services/edits'
import { runGeneration } from '../services/generate'
import type { Composed } from './PromptComposer'
import type { PromptOptimizationMetadata } from '../types'
import { useCanvas } from '../store/canvasStore'
import { useSelection } from '../store/selectionStore'
import PlanList from './PlanList'
import PromptComposer from './PromptComposer'
import AgentOrchestrationCard from './AgentOrchestrationCard'
import { useT } from '../i18n'

function isPromptOptimizationMessage(content: string): boolean {
  return content.startsWith('### 提示词优化过程') || content.startsWith('### Prompt optimization')
}

function PromptOptimizationCard({ optimization }: { optimization: PromptOptimizationMetadata }) {
  const completeCount = optimization.agentReviews.filter(
    (review) => review.status === 'complete',
  ).length

  return (
    <div className="prompt-optimization-card">
      <div className="prompt-opt-header">
        <h3>提示词优化过程</h3>
        <span>
          {completeCount}/{optimization.agentReviews.length} Agent 完成挑刺
        </span>
      </div>
      {optimization.userIntent && (
        <section>
          <strong>1. 意图识别</strong>
          <p>{optimization.userIntent}</p>
        </section>
      )}
      <section>
        <strong>2. 优化策略拆解</strong>
        <ol>
          {optimization.strategySteps.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      </section>
      <section>
        <strong>3. 多 Agent 挑刺与增强</strong>
        <div className="prompt-agent-grid">
          {optimization.agentReviews.map((review) => (
            <div key={review.agent} className="prompt-agent-review" data-status={review.status}>
              <div className="prompt-agent-title">
                <span>{review.agent}</span>
                <small>{review.status === 'complete' ? '完成' : '未返回'}</small>
              </div>
              <p className="muted">{review.focus}</p>
              {review.status === 'complete' ? (
                <>
                  <p>
                    <b>挑刺：</b>
                    {review.finding}
                  </p>
                  <p>
                    <b>增强：</b>
                    {review.improvement}
                  </p>
                </>
              ) : (
                <p>该角色没有返回结构化意见，本次不伪造结果。</p>
              )}
            </div>
          ))}
        </div>
      </section>
      {optimization.intermediatePrompt && (
        <section>
          <strong>4. 中间提示词</strong>
          <pre>{optimization.intermediatePrompt}</pre>
        </section>
      )}
      {optimization.finalPrompt && (
        <section>
          <strong>5. 最终优化提示词</strong>
          <pre>{optimization.finalPrompt}</pre>
        </section>
      )}
    </div>
  )
}

export default function AgentPanel({ projectId }: { projectId: string }) {
  const t = useT()
  const messages = useChat((s) =>
    s.messages.filter((m) => m.projectId === projectId && m.role !== 'tool'),
  )
  const agentBusy = useChat((s) => !!s.busy[projectId])
  const apiKey = useSettings((s) => s.apiKey)
  const [input, setInput] = useState('')
  const [directBusy, setDirectBusy] = useState(false)
  const selectedIds = useSelection((s) => s.ids)
  const clearSelection = useSelection((s) => s.clear)
  const threadRef = useRef<HTMLDivElement>(null)
  const busy = agentBusy || directBusy

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages.length, busy])

  const labels = {
    genDone: t('genDone'),
    genFailed: t('genFailed'),
    reference: t('reference'),
    image: t('modeImage'),
    video: t('modeVideo'),
  }

  const onSubmit = async (c: Composed) => {
    // Merge marquee-selected image cards on the canvas into the references.
    const selCards = useCanvas
      .getState()
      .cards.filter(
        (cc) => cc.projectId === projectId && selectedIds.includes(cc.id) && cc.type === 'image',
      )
    let selBlobs: Blob[] = []
    try {
      selBlobs = await Promise.all(selCards.map(blobForCard))
    } catch {
      /* skip unreadable */
    }
    clearSelection()

    setDirectBusy(true)
    try {
      await runGeneration(projectId, { ...c, refBlobs: [...c.refBlobs, ...selBlobs], labels })
    } finally {
      setDirectBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <PlanList projectId={projectId} />
        {messages.map((m) => {
          const isStructuredMessage = Boolean(
            m.metadata?.orchestration ||
            m.metadata?.promptOptimization ||
            isPromptOptimizationMessage(m.content),
          )
          return (
            <div
              key={m.id}
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                minWidth: 0,
              }}
            >
              <div
                className={
                  [
                    m.role === 'assistant' && !isStructuredMessage ? 'md' : '',
                    isPromptOptimizationMessage(m.content) &&
                    !m.metadata?.promptOptimization &&
                    !m.metadata?.orchestration
                      ? 'prompt-optimization-card'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                style={{
                  maxWidth: isStructuredMessage ? '96%' : '85%',
                  minWidth: 0,
                  overflow: 'hidden',
                  padding:
                    m.metadata?.promptOptimization || m.metadata?.orchestration
                      ? 0
                      : isPromptOptimizationMessage(m.content)
                        ? '12px 14px'
                        : '8px 12px',
                  fontSize: 14,
                  lineHeight: 1.5,
                  borderRadius: 'var(--radius-input)',
                  whiteSpace: m.role === 'user' ? 'pre-wrap' : undefined,
                  background:
                    m.metadata?.promptOptimization || m.metadata?.orchestration
                      ? 'transparent'
                      : m.role === 'user'
                        ? 'var(--accent-grad)'
                        : 'var(--bg-elevated)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                }}
              >
                {m.metadata?.orchestration ? (
                  <AgentOrchestrationCard orchestration={m.metadata.orchestration} />
                ) : m.metadata?.promptOptimization ? (
                  <PromptOptimizationCard optimization={m.metadata.promptOptimization} />
                ) : m.role === 'assistant' ? (
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
            </div>
          )
        })}
        {busy && (
          <div className="muted" style={{ clear: 'both', fontSize: 13, padding: '6px 2px' }}>
            {agentBusy ? t('agentWorking') : t('generating')}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
        <PromptComposer
          projectId={projectId}
          text={input}
          onText={setInput}
          apiKey={apiKey}
          busy={busy}
          placeholder={apiKey ? t('askAgent') : t('setKeyFirst')}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}
