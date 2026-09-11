import { useChat } from '../store/chatStore'
import type { PlanStatus } from '../types'

const ICON: Record<PlanStatus, string> = {
  pending: '○',
  running: '⟳',
  done: '✓',
  failed: '✗',
}
const COLOR: Record<PlanStatus, string> = {
  pending: 'var(--text-muted)',
  running: 'var(--accent)',
  done: 'var(--success)',
  failed: 'var(--danger)',
}

export default function PlanList({ projectId }: { projectId: string }) {
  const steps = useChat((s) => s.plans.filter((p) => p.projectId === projectId))
  if (steps.length === 0) return null

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-input)',
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        PLAN
      </div>
      {steps.map((s) => (
        <div key={s.id} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 14 }}>
          <span style={{ color: COLOR[s.status], width: 16 }}>{ICON[s.status]}</span>
          <span
            style={{ color: s.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)' }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}
