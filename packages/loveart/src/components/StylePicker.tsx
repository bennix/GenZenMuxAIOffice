import { useId } from 'react'
import { listStyleTemplates, styleBySlug } from '../services/styleTemplates'
import type { Aspect } from '../services/styleTemplates'
import {
  applyYouMindTemplate,
  extractYouMindBrief,
  listYouMindTemplates,
  youMindCategoryById,
  youMindTemplateById,
} from '../services/youmind'
import { useT } from '../i18n'
import { useSettings } from '../store/settingsStore'

// Style selector (image mode only). Pick a cookbook style template; the user's prompt
// becomes the SUBJECT and is wrapped with the style's full template before generating.
export default function StylePicker({
  slug,
  onStyle,
  youMindTemplateId = null,
  onYouMindTemplate,
  onYouMindCategory,
  aspect = '16:9',
  promptText = '',
  onPromptText,
}: {
  slug: string | null
  onStyle: (slug: string | null) => void
  youMindTemplateId?: string | null
  onYouMindTemplate?: (templateId: string | null) => void
  onYouMindCategory?: (categoryId: string | null) => void
  aspect?: Aspect
  promptText?: string
  onPromptText?: (text: string) => void
}) {
  const t = useT()
  const lang = useSettings((state) => state.lang)
  const tooltipId = useId()
  const styles = listStyleTemplates(lang)
  const youMindTemplates = listYouMindTemplates(lang)
  const activeYouMindTemplate = youMindTemplateId
    ? youMindTemplateById(youMindTemplateId, lang)
    : undefined
  const active = !activeYouMindTemplate && slug ? styleBySlug(slug, lang) : undefined
  const helpText = activeYouMindTemplate
    ? `${activeYouMindTemplate.summary} ${t('youMindUseCategory')}: ${
        youMindCategoryById(activeYouMindTemplate.categoryId, lang)?.guidance ??
        activeYouMindTemplate.category
      }`
    : (active?.summary ?? t('stylePickerHint'))
  const value = activeYouMindTemplate
    ? `youmind:${activeYouMindTemplate.id}`
    : slug
      ? `style:${slug}`
      : ''

  const selectYouMindTemplate = (templateId: string) => {
    const template = youMindTemplateById(templateId, lang)
    if (!template) return
    const category = youMindCategoryById(template.categoryId, lang)
    const brief = extractYouMindBrief(promptText) ?? promptText
    onStyle(null)
    onYouMindCategory?.(template.categoryId)
    onYouMindTemplate?.(template.id)
    onPromptText?.(
      applyYouMindTemplate(template, {
        brief,
        aspect,
        locale: lang,
        category,
      }),
    )
  }

  const selectStyle = (nextValue: string) => {
    if (!nextValue) {
      onStyle(null)
      onYouMindCategory?.(null)
      onYouMindTemplate?.(null)
      return
    }
    if (nextValue.startsWith('youmind:')) {
      selectYouMindTemplate(nextValue.slice('youmind:'.length))
      return
    }
    onYouMindCategory?.(null)
    onYouMindTemplate?.(null)
    onStyle(nextValue.replace(/^style:/, ''))
  }

  return (
    <div className="style-picker">
      <select
        aria-label={t('style')}
        value={value}
        onChange={(e) => selectStyle(e.target.value)}
        title={helpText}
        className="style-picker-select"
      >
        <option value="">{t('styleNone')}</option>
        <optgroup label={t('styleGroupCookbook')}>
          {styles.map((s) => (
            <option key={s.slug} value={`style:${s.slug}`} title={s.summary}>
              🎨 {s.name}
            </option>
          ))}
        </optgroup>
        <optgroup label={t('styleGroupYouMind')}>
          {youMindTemplates.map((template) => (
            <option key={template.id} value={`youmind:${template.id}`} title={template.summary}>
              🧠 {template.title}
            </option>
          ))}
        </optgroup>
      </select>
      <span className="style-help">
        <button
          type="button"
          className="style-help-trigger"
          aria-label={t('styleInfo')}
          aria-describedby={tooltipId}
          title={helpText}
        >
          ?
        </button>
        <span id={tooltipId} className="style-help-tooltip" role="tooltip">
          {helpText}
        </span>
      </span>
    </div>
  )
}
