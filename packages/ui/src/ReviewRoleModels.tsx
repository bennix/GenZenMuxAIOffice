import './review-role-models.css'

/** One model name per review role. Suggestions fill the list; any ZenMux id can be typed. */
export function ReviewRoleModels({
  roles,
  values,
  suggestions,
  disabled,
  label,
  onChange,
}: {
  roles: string[]
  values: string[]
  suggestions: string[]
  disabled?: boolean
  label: string
  onChange: (index: number, value: string) => void
}) {
  return (
    <fieldset className="review-role-models" disabled={disabled}>
      <legend>{label}</legend>
      {roles.map((role, index) => (
        <label key={`${role}-${index}`}>
          <span>{role}</span>
          <input
            list="review-role-model-suggestions"
            value={values[index] ?? ''}
            spellCheck={false}
            placeholder="provider/model-name"
            aria-label={role}
            onChange={(event) => onChange(index, event.target.value)}
          />
        </label>
      ))}
      <datalist id="review-role-model-suggestions">
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </fieldset>
  )
}
