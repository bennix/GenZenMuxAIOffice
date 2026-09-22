import { useT } from '../i18n'

export default function VideoDurationSelect({
  durations,
  value,
  onChange,
}: {
  durations: number[]
  value: number
  onChange: (duration: number) => void
}) {
  const t = useT()
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span className="muted">{t('duration')}</span>
      <select
        aria-label={t('duration')}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {durations.map((duration) => (
          <option key={duration} value={duration}>
            {duration}s
          </option>
        ))}
      </select>
    </label>
  )
}
