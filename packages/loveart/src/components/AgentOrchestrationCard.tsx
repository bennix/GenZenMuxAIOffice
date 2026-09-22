import type { AgentOrchestrationMetadata, AgentOrchestrationStatus } from '../types'

const statusColor: Record<AgentOrchestrationStatus, string> = {
  pending: 'var(--text-muted)',
  running: 'var(--accent)',
  done: '#18a058',
  warning: '#d97706',
  failed: 'var(--danger)',
}

export default function AgentOrchestrationCard({
  orchestration,
}: {
  orchestration: AgentOrchestrationMetadata
}) {
  return (
    <div className="prompt-optimization-card">
      <div className="prompt-opt-header">
        <h3>Agent 编排流程</h3>
        <span>{orchestration.loadedPolicies.join(', ')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orchestration.stages.map((stage) => (
          <section
            key={stage.id}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}
          >
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <strong>{stage.title}</strong>
              <span style={{ color: statusColor[stage.status], fontSize: 12 }}>{stage.status}</span>
            </div>
            <p className="muted" style={{ margin: '6px 0', fontSize: 12 }}>
              {stage.summary}
            </p>
            {stage.details.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {stage.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
