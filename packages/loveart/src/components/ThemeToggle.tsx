import { useSettings, resolveTheme } from '../store/settingsStore'

// Compact toggle. Bases its icon on the *resolved* theme (so it's correct even when
// following the system) and sets an explicit dark/light override on click.
export default function ThemeToggle() {
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  const resolved = resolveTheme(theme)
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      className="muted"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      style={{ fontSize: 16, lineHeight: 1 }}
    >
      {resolved === 'dark' ? '☀' : '🌙'}
    </button>
  )
}
