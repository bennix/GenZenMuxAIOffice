import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { listOpenDesignSystems, listOpenDesignTemplates } from '../services/openDesign'
import type {
  OpenDesignSource,
  OpenDesignSurface,
  OpenDesignSystem,
  OpenDesignTemplate,
} from '../services/openDesign'
import { listYouMindCategories, listYouMindTemplates } from '../services/youmind'
import type { YouMindCategory, YouMindTemplate } from '../services/youmind'
import { useT } from '../i18n'
import { useSettings } from '../store/settingsStore'

type DrawerTab = 'systems' | OpenDesignSurface | 'youmind'
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface OpenDesignLibraryDrawerProps {
  open: boolean
  mode: OpenDesignSurface
  onClose: () => void
  onSystem: (systemId: string) => void
  onTemplate: (template: OpenDesignTemplate) => boolean | void
  onYouMindCategory: (categoryId: string | null) => void
  onYouMindTemplate: (templateId: string | null) => boolean | void
}

function sourceLabel(source: OpenDesignSource): string {
  try {
    return new URL(source.repo).hostname.replace(/^www\./, '')
  } catch {
    return source.repo
  }
}

function renderSource(source: OpenDesignSource) {
  return (
    <div className="od-drawer-source">
      <span>{sourceLabel(source)}</span>
      <span>{source.license}</span>
    </div>
  )
}

export default function OpenDesignLibraryDrawer({
  open,
  mode,
  onClose,
  onSystem,
  onTemplate,
  onYouMindCategory,
  onYouMindTemplate,
}: OpenDesignLibraryDrawerProps) {
  const t = useT()
  const lang = useSettings((state) => state.lang)
  const [tab, setTab] = useState<DrawerTab>(mode)
  const drawerRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (open) setTab(mode)
  }, [mode, open])

  useEffect(() => {
    if (!open) return undefined

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()

    return () => {
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  const systems = listOpenDesignSystems(lang)
  const templates = tab === 'image' || tab === 'video' ? listOpenDesignTemplates(tab, lang) : []
  const youMindCategories = listYouMindCategories(lang)
  const youMindTemplates = listYouMindTemplates(lang)
  const applySystem = (system: OpenDesignSystem) => {
    onSystem(system.id)
    onClose()
  }

  const applyTemplate = (template: OpenDesignTemplate) => {
    if (onTemplate(template) !== false) onClose()
  }

  const applyYouMindCategory = (category: YouMindCategory) => {
    onYouMindCategory(category.id)
    onClose()
  }

  const applyYouMindTemplate = (template: YouMindTemplate) => {
    if (onYouMindTemplate(template.id) !== false) onClose()
  }

  const onDrawerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return

    const drawer = drawerRef.current
    if (!drawer) return

    const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (!focusable.length) {
      event.preventDefault()
      drawer.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || !drawer.contains(active)) {
        event.preventDefault()
        last.focus()
      }
      return
    }

    if (active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="od-drawer-backdrop" onClick={onClose}>
      <aside
        ref={drawerRef}
        className="od-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('openDesignLibrary')}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDrawerKeyDown}
      >
        <div className="od-drawer-header">
          <h2>{t('openDesignLibrary')}</h2>
          <button
            ref={closeButtonRef}
            className="od-drawer-close"
            onClick={onClose}
            aria-label={t('cancel')}
          >
            ×
          </button>
        </div>

        <div className="od-tabs" role="tablist">
          <button
            className={`od-tab${tab === 'systems' ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === 'systems'}
            onClick={() => setTab('systems')}
          >
            {t('openDesignSystems')}
          </button>
          <button
            className={`od-tab${tab === 'image' ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === 'image'}
            onClick={() => setTab('image')}
          >
            {t('openDesignImageTemplates')}
          </button>
          <button
            className={`od-tab${tab === 'video' ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === 'video'}
            onClick={() => setTab('video')}
          >
            {t('openDesignVideoTemplates')}
          </button>
          <button
            className={`od-tab${tab === 'youmind' ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === 'youmind'}
            onClick={() => setTab('youmind')}
          >
            {t('youMindLibraryTab')}
          </button>
        </div>

        <div className="od-list">
          {tab === 'youmind' ? (
            <>
              {youMindCategories.map((category) => (
                <article className="od-card" key={category.id}>
                  {category.previewImageUrl && (
                    <img
                      className="od-preview"
                      src={category.previewImageUrl}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <div className="od-drawer-meta">
                    <span>{category.sourceCountLabel ?? 'YouMind'}</span>
                  </div>
                  <h3>{category.title}</h3>
                  <p>{category.summary}</p>
                  <div className="od-tags">
                    {category.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="od-drawer-source">
                    <a href={category.sourceUrl} target="_blank" rel="noreferrer">
                      {t('youMindSource')}
                    </a>
                  </div>
                  <button
                    className="btn-ghost od-card-use"
                    onClick={() => applyYouMindCategory(category)}
                  >
                    {t('youMindUseCategory')}
                  </button>
                </article>
              ))}
              {youMindTemplates.map((template) => (
                <article className="od-card" key={template.id}>
                  {template.previewImageUrl && (
                    <img
                      className="od-preview"
                      src={template.previewImageUrl}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <div className="od-drawer-meta">
                    <span>{template.category}</span>
                    <span>{template.model}</span>
                  </div>
                  <h3>{template.title}</h3>
                  <p>{template.summary}</p>
                  <div className="od-tags">
                    {template.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="od-drawer-source">
                    <a href={template.source.url} target="_blank" rel="noreferrer">
                      {t('youMindSource')}
                    </a>
                  </div>
                  <button
                    className="btn-ghost od-card-use"
                    onClick={() => applyYouMindTemplate(template)}
                  >
                    {t('openDesignUse')}
                  </button>
                </article>
              ))}
            </>
          ) : tab === 'systems' ? (
            systems.map((system) => (
              <article className="od-card" key={system.id}>
                <div className="od-drawer-meta">
                  <span>{system.category}</span>
                </div>
                <h3>{system.name}</h3>
                <p>{system.summary}</p>
                <div className="od-tags">
                  <span>design-system</span>
                </div>
                {renderSource(system.source)}
                <button className="btn-ghost od-card-use" onClick={() => applySystem(system)}>
                  {t('openDesignUse')}
                </button>
              </article>
            ))
          ) : (
            templates.map((template) => (
              <article className="od-card" key={template.id}>
                {template.previewImageUrl && (
                  <img
                    className="od-preview"
                    src={template.previewImageUrl}
                    alt=""
                    loading="lazy"
                  />
                )}
                {template.previewVideoUrl && (
                  <a
                    className="od-preview-link"
                    href={template.previewVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('openDesignPreviewVideo')}
                  </a>
                )}
                <div className="od-drawer-meta">
                  <span>{template.category}</span>
                  <span>{template.model}</span>
                </div>
                <h3>{template.title}</h3>
                <p>{template.summary}</p>
                <div className="od-tags">
                  {template.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                {renderSource(template.source)}
                <button className="btn-ghost od-card-use" onClick={() => applyTemplate(template)}>
                  {t('openDesignUse')}
                </button>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  )
}
