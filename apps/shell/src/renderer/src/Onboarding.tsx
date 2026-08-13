import { useEffect, useRef, useState } from 'react'
import {
  ZENMUX_BASE_URL,
  ZENMUX_IMAGE_MODELS,
  ZENMUX_MODELS,
  type AiSettings,
} from '@genoffice/ai-provider'
import appIcon from './assets/app-icon.png'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import './onboarding.css'

interface OnboardingProps {
  /** called when the user finishes the last slide or clicks skip */
  onDone: () => void
}

interface Slide {
  titleKey: StringKey
  /** 18px dark line right under the title */
  subtitleKey: StringKey
  /** 16px muted paragraph below the title block */
  bodyKey?: StringKey
  /** render the body in the dimmer footnote gray (slide 3's credits disclaimer) */
  bodyDim?: boolean
  /** the second slide embeds the first-run ZenMux API configuration */
  showZenMuxSetup?: boolean
  art: 'logo' | 'gift' | 'check'
}

const SLIDES: readonly Slide[] = [
  { titleKey: 'onbTitle1', subtitleKey: 'onbSubtitle1', showZenMuxSetup: true, art: 'logo' },
  {
    titleKey: 'onbTitle3',
    subtitleKey: 'onbBody3',
    bodyKey: 'onbNote3',
    bodyDim: true,
    art: 'check',
  },
]

/* exact vectors from the design spec:
 * 60px canvas, 4px strokes — same visual mass as the 60px app icon */
function SlideArt({ kind }: { kind: Slide['art'] }) {
  if (kind === 'logo') {
    return <img className="onb-art onb-art-logo" src={appIcon} alt="" />
  }
  if (kind === 'gift') {
    // hand-drawn gift kept over the spec vector deliberately; 48 canvas at
    // strokeWidth 3.2 renders the same 4px strokes at 60px as the check icon
    return (
      <span className="onb-art onb-art-badge onb-art-gift" aria-hidden="true">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="6" y="14" width="36" height="9" rx="2" />
          <path d="M9.5 23v15a4 4 0 0 0 4 4h21a4 4 0 0 0 4-4V23" />
          <path d="M24 14v28" />
          <path d="M24 14c-7 0-10.5-2.6-10.5-6 0-2.5 2-4.5 4.5-4.5 4.2 0 6 5.3 6 10.5Z" />
          <path d="M24 14c7 0 10.5-2.6 10.5-6 0-2.5-2-4.5-4.5-4.5-4.2 0-6 5.3-6 10.5Z" />
        </svg>
      </span>
    )
  }
  return (
    <span className="onb-art onb-art-badge onb-art-check" aria-hidden="true">
      <svg viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="4">
        <path
          d="M29.9883 5.5C43.5194 5.5 54.4883 16.469 54.4883 30C54.4883 43.5311 43.5194 54.5 29.9883 54.5C16.4573 54.5 5.48828 43.5311 5.48828 30C5.48828 16.469 16.4573 5.5 29.9883 5.5Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18.125 33.75L24.7764 40.4014C25.8727 41.4977 27.6924 41.342 28.5865 40.0753L41.875 21.25"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function Onboarding({ onDone }: OnboardingProps) {
  const { lang, t } = useI18n()
  const [index, setIndex] = useState(0)
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState<string>(ZENMUX_MODELS[0])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const slide = SLIDES[index]
  const isLast = index === SLIDES.length - 1

  const isChinese = lang === 'zh' || lang === 'zh-TW'

  useEffect(() => {
    let alive = true
    void window.aiOffice
      .getAiSettings()
      .then((settings) => {
        if (!alive) return
        setAiSettings(settings)
        setApiKey(settings.providers.zenmux.apiKey)
        setModel(settings.providers.zenmux.model || ZENMUX_MODELS[0])
      })
      .catch(() => {
        if (alive) setSaveError(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const saveZenMuxSettings = async (): Promise<boolean> => {
    if (!apiKey.trim()) return true
    if (!aiSettings) {
      setSaveError(true)
      return false
    }
    setSaving(true)
    setSaveError(false)
    const current = aiSettings.providers.zenmux
    const nextSettings: AiSettings = {
      ...aiSettings,
      provider: 'zenmux',
      providers: {
        ...aiSettings.providers,
        zenmux: {
          ...current,
          apiKey: apiKey.trim(),
          baseUrl: ZENMUX_BASE_URL,
          model,
          models: [...new Set([...(current.models ?? []), ...ZENMUX_MODELS, model])],
          imageModel: current.imageModel || ZENMUX_IMAGE_MODELS[0],
          imageModels: current.imageModels ?? [...ZENMUX_IMAGE_MODELS],
        },
      },
    }
    try {
      await window.aiOffice.setAiSettings(nextSettings)
      setAiSettings(nextSettings)
      return true
    } catch {
      setSaveError(true)
      return false
    } finally {
      setSaving(false)
    }
  }

  const next = async () => {
    if (saving) return
    if (index === 0 && !(await saveZenMuxSettings())) return
    if (isLast) onDone()
    else setIndex(index + 1)
  }

  // move focus into the dialog on mount so keyboard users start inside it
  // (the container, not a button, so no focus ring shows on open)
  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  // Slide changes make the previous controls inert and blur them. Pull focus
  // back onto the card so it never drops behind the modal.
  useEffect(() => {
    const card = cardRef.current
    const active = document.activeElement
    if (card && (!(active instanceof HTMLElement) || !card.contains(active))) card.focus()
  }, [index])

  // keyboard handling: Escape skips, Enter / ArrowRight advance, ArrowLeft goes
  // back, and Tab is trapped inside the dialog (aria-modal). Enter is ignored
  // when a button is focused so the native click doesn't double-fire.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDone()
        return
      }
      if (event.key === 'Tab') {
        const card = cardRef.current
        if (!card) return
        // inactive slides stay mounted (stacked for the height lock) but are
        // inert — their buttons must not enter the tab cycle
        const focusables = Array.from(card.querySelectorAll<HTMLElement>('button')).filter(
          (el) => !el.closest('[inert]'),
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        // the card itself holds focus on open/slide change; from there, Tab in
        // either direction must land on a dialog control, never behind the modal
        const onButton = active instanceof HTMLElement && focusables.includes(active)
        if (!onButton) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        } else if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
        return
      }
      const controlFocused =
        event.target instanceof HTMLElement &&
        event.target.closest('button, input, select, textarea, a') !== null
      if ((event.key === 'Enter' && !controlFocused) || event.key === 'ArrowRight') void next()
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="onb-overlay" role="dialog" aria-modal="true" aria-label={t(slide.titleKey)}>
      <div className="onb-card" ref={cardRef} tabIndex={-1}>
        {/* all slides stay mounted, stacked in one grid cell: the card locks to
            the tallest slide's height for the language, so the footer and its
            buttons never move between steps. Inactive slides are inert. */}
        <div className="onb-stage">
          {SLIDES.map((s, i) => (
            <div
              className={`onb-slide${i === index ? ' active' : ''}`}
              key={s.titleKey}
              inert={i !== index}
            >
              <SlideArt kind={s.art} />
              <h2 className="onb-title">
                {s.showZenMuxSetup
                  ? isChinese
                    ? '连接 ZenMux AI'
                    : 'Connect ZenMux AI'
                  : t(s.titleKey)}
              </h2>
              <p className="onb-subtitle">
                {s.showZenMuxSetup
                  ? isChinese
                    ? '填写 API Key，即可在所有编辑器中使用 AI。'
                    : 'Enter an API Key to enable AI in every editor.'
                  : t(s.subtitleKey)}
              </p>
              {s.bodyKey && (
                <p className={`onb-body${s.bodyDim ? ' onb-body-dim' : ''}`}>{t(s.bodyKey)}</p>
              )}
              {s.showZenMuxSetup && (
                <div className="onb-zenmux-setup">
                  <label className="onb-field" htmlFor="onb-zenmux-key">
                    <span>
                      {isChinese
                        ? 'ZenMux API Key（加密保存在本机）'
                        : 'ZenMux API Key (encrypted locally)'}
                    </span>
                    <input
                      id="onb-zenmux-key"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      placeholder="ZenMux API Key"
                      onChange={(event) => {
                        setApiKey(event.target.value)
                        setSaveError(false)
                      }}
                    />
                  </label>
                  <label className="onb-field" htmlFor="onb-zenmux-model">
                    <span>{isChinese ? '默认模型' : 'Default model'}</span>
                    <select
                      id="onb-zenmux-model"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                    >
                      {ZENMUX_MODELS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="onb-zenmux-help">
                    <span>{isChinese ? '还没有 API Key？' : "Don't have an API Key?"}</span>
                    <button
                      className="onb-invite"
                      onClick={() => void window.aiOffice.openZenMuxInvite()}
                    >
                      {isChinese ? '使用邀请链接申请' : 'Get one with the invite link'} ↗
                    </button>
                  </div>
                  <div className="onb-invite-url">https://zenmux.ai/invite/GBQMC5</div>
                  <p className={`onb-save-status${saveError ? ' error' : ''}`} aria-live="polite">
                    {saveError
                      ? isChinese
                        ? 'API Key 保存失败，请重试或稍后在设置中填写。'
                        : 'Could not save the API Key. Retry or enter it later in Settings.'
                      : isChinese
                        ? 'AI 功能依赖网络；网络或代理状态可能影响使用。'
                        : 'AI features require network access and may be affected by proxy conditions.'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="onb-footer">
          <div className="onb-dots">
            {SLIDES.map((s, i) => (
              <button
                key={s.titleKey}
                className={`onb-dot${i === index ? ' active' : ''}`}
                aria-label={t('onbStepAria', { n: i + 1, total: SLIDES.length })}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <div className="onb-nav">
            <button className="onb-skip" onClick={onDone}>
              {t('onbSkip')}
            </button>
            {index > 0 && (
              <button className="onb-back" onClick={() => setIndex(index - 1)}>
                {t('onbBack')}
              </button>
            )}
            <button className="onb-next" onClick={() => void next()} disabled={saving}>
              {saving
                ? isChinese
                  ? '正在保存…'
                  : 'Saving…'
                : isLast
                  ? t('onbStart')
                  : index === 0 && apiKey.trim()
                    ? isChinese
                      ? '保存并继续'
                      : 'Save and continue'
                    : t('onbNext')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
