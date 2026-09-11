import { Link } from 'react-router-dom'
import { INVITE_URL, useSettings } from '../store/settingsStore'
import { useT } from '../i18n'

// Shown app-wide when no API key is set — REQUIREMENTS.md §3.2.
export default function NoKeyBanner() {
  const apiKey = useSettings((s) => s.apiKey)
  const t = useT()
  if (apiKey) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        flexWrap: 'wrap',
        padding: '12px 20px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-input)',
        margin: '12px auto',
        maxWidth: 880,
      }}
    >
      <span className="muted">{t('noKeyMsg')}</span>
      <a className="btn-accent" href={INVITE_URL} target="_blank" rel="noreferrer">
        {t('getApiKey')}
      </a>
      <Link to="/settings" className="btn-ghost">
        {t('goSettings')}
      </Link>
    </div>
  )
}
