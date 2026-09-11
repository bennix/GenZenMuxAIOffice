import { useSettings } from '../store/settingsStore'
import type { ModelCategory } from '../types'

// Model picker sourced from the registry, filtered by category, and bound to the
// default for that category. Selecting sets the category default. REQUIREMENTS.md §3.3.
export default function ModelPicker({ category }: { category: ModelCategory }) {
  const models = useSettings((s) => s.models.filter((m) => m.category === category))
  const setDefault = useSettings((s) => s.setDefault)
  const current = models.find((m) => m.isDefault) ?? models[0]

  return (
    <select
      value={current?.id ?? ''}
      onChange={(e) => setDefault(e.target.value)}
      style={{
        background: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: '6px 12px',
        fontSize: 13,
      }}
      title={`${category} model`}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  )
}
