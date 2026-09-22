import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import ThemeToggle from './ThemeToggle'

export default function TopNav() {
  const t = useT()
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Link
        to="/"
        style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 6,
            background: 'var(--accent-grad)',
            display: 'inline-block',
          }}
        />
        <strong style={{ color: 'var(--text-primary)', fontSize: 16 }}>ArtFlow</strong>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <ThemeToggle />
        <Link to="/settings" className="muted" style={{ fontSize: 14 }} title={t('settings')}>
          ⚙ {t('settings')}
        </Link>
      </div>
    </nav>
  )
}
