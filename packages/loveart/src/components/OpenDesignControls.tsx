import { useEffect, useState } from 'react'
import OpenDesignLibraryDrawer from './OpenDesignLibraryDrawer'
import { listOpenDesignSystems, listOpenDesignTemplates } from '../services/openDesign'
import type { OpenDesignSurface } from '../services/openDesign'
import { listYouMindCategories, listYouMindTemplates } from '../services/youmind'
import { useT } from '../i18n'
import { useSettings } from '../store/settingsStore'

interface OpenDesignControlsProps {
  mode: OpenDesignSurface
  systemId: string | null
  templateId: string | null
  youMindCategoryId: string | null
  youMindTemplateId: string | null
  onMode?: (mode: OpenDesignSurface) => void
  onSystem: (systemId: string | null) => void
  onTemplate: (templateId: string | null) => void
  onYouMindCategory: (categoryId: string | null) => void
  onYouMindTemplate: (templateId: string | null) => void
}

export default function OpenDesignControls({
  mode,
  systemId,
  templateId,
  youMindCategoryId,
  youMindTemplateId,
  onMode,
  onSystem,
  onTemplate,
  onYouMindCategory,
  onYouMindTemplate,
}: OpenDesignControlsProps) {
  const t = useT()
  const lang = useSettings((state) => state.lang)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const systems = listOpenDesignSystems(lang)
  const templates = listOpenDesignTemplates(mode, lang)
  const youMindCategories = listYouMindCategories(lang)
  const allYouMindTemplates = listYouMindTemplates(lang)
  const youMindTemplates = mode === 'image' ? allYouMindTemplates : []
  const activeSystemId = systems.some((system) => system.id === systemId) ? (systemId ?? '') : ''
  const activeTemplateId = templates.some((template) => template.id === templateId)
    ? (templateId ?? '')
    : ''
  const activeYouMindCategoryId = youMindCategories.some(
    (category) => category.id === youMindCategoryId,
  )
    ? (youMindCategoryId ?? '')
    : ''
  const activeYouMindTemplateId = youMindTemplates.some(
    (template) => template.id === youMindTemplateId,
  )
    ? (youMindTemplateId ?? '')
    : ''
  const hasSelection = Boolean(
    activeSystemId || activeTemplateId || activeYouMindCategoryId || activeYouMindTemplateId,
  )

  useEffect(() => {
    if (templateId && !activeTemplateId) onTemplate(null)
    if (youMindCategoryId && !activeYouMindCategoryId) onYouMindCategory(null)
    if (youMindTemplateId && !activeYouMindTemplateId) onYouMindTemplate(null)
  }, [
    activeTemplateId,
    activeYouMindCategoryId,
    activeYouMindTemplateId,
    onTemplate,
    onYouMindCategory,
    onYouMindTemplate,
    templateId,
    youMindCategoryId,
    youMindTemplateId,
  ])

  const clear = () => {
    onSystem(null)
    onTemplate(null)
    onYouMindCategory(null)
    onYouMindTemplate(null)
  }
  const selectTemplate = (
    nextTemplateId: string | null,
    surface: OpenDesignSurface = mode,
  ): boolean => {
    if (!nextTemplateId) {
      onTemplate(null)
      return true
    }

    if (listOpenDesignTemplates(surface, lang).some((template) => template.id === nextTemplateId)) {
      if (surface !== mode) {
        if (!onMode) return false
        onMode(surface)
      }
      onTemplate(nextTemplateId)
      return true
    }

    return false
  }
  const selectYouMindTemplate = (nextTemplateId: string | null): boolean => {
    if (!nextTemplateId) {
      onYouMindTemplate(null)
      return true
    }

    if (allYouMindTemplates.some((template) => template.id === nextTemplateId)) {
      if (mode !== 'image') {
        if (!onMode) return false
        onMode('image')
      }
      onYouMindTemplate(nextTemplateId)
      return true
    }

    return false
  }

  return (
    <>
      <div className="od-controls">
        <label className="od-field">
          <span>{t('openDesignSystem')}</span>
          <select
            aria-label={t('openDesignSystem')}
            value={activeSystemId}
            onChange={(event) => onSystem(event.target.value || null)}
          >
            <option value="">{t('openDesignNone')}</option>
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
        </label>

        <label className="od-field">
          <span>{t('openDesignTemplate')}</span>
          <select
            aria-label={t('openDesignTemplate')}
            value={activeTemplateId}
            onChange={(event) => selectTemplate(event.target.value || null)}
          >
            <option value="">{t('openDesignNone')}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </label>

        <label className="od-field">
          <span>{t('youMindCategory')}</span>
          <select
            aria-label={t('youMindCategory')}
            value={activeYouMindCategoryId}
            onChange={(event) => onYouMindCategory(event.target.value || null)}
          >
            <option value="">{t('openDesignNone')}</option>
            {youMindCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
          </select>
        </label>

        <label className="od-field">
          <span>{t('youMindTemplate')}</span>
          <select
            aria-label={t('youMindTemplate')}
            value={activeYouMindTemplateId}
            onChange={(event) => selectYouMindTemplate(event.target.value || null)}
            disabled={mode !== 'image'}
          >
            <option value="">{t('openDesignNone')}</option>
            {youMindTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </label>

        <button className="btn-ghost od-control-button" onClick={() => setDrawerOpen(true)}>
          {t('openDesignBrowse')}
        </button>
        {hasSelection && (
          <button className="btn-ghost od-control-button" onClick={clear}>
            {t('openDesignClear')}
          </button>
        )}
      </div>

      <OpenDesignLibraryDrawer
        open={drawerOpen}
        mode={mode}
        onClose={() => setDrawerOpen(false)}
        onSystem={onSystem}
        onTemplate={(template) => selectTemplate(template.id, template.surface)}
        onYouMindCategory={onYouMindCategory}
        onYouMindTemplate={selectYouMindTemplate}
      />
    </>
  )
}
