import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import { LANGUAGE_OPTIONS } from '@genoffice/i18n'
import type {
  AccountStatus,
  KnowledgeMemoryItem,
  KnowledgeSettingsItem,
  UiTheme,
} from '../../shared/home-api'
import type { WechatDiaryStatus } from '../../shared/wechat-diary-api'
import { removeActiveModel, resolveModelOptions } from './model-options'
import {
  ZENMUX_BASE_URL,
  ZENMUX_IMAGE_MODELS,
  ZENMUX_MODELS,
  type AiSettings,
} from '@genoffice/ai-provider'
import './settings.css'

// ── Settings modal (opened from the account menu) ─────────
// Zoom-style two-pane dialog: section nav on the left, fields on the right.
// All values go through the existing home IPC; nothing is stored locally.

const THEME_OPTIONS = [
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
  { value: 'system', labelKey: 'themeSystem' },
] as const satisfies readonly { value: UiTheme; labelKey: StringKey }[]

const CHANNEL_OPTIONS = [
  { value: 'stable', labelKey: 'channelStable' },
  { value: 'beta', labelKey: 'channelBeta' },
] as const satisfies readonly { value: 'stable' | 'beta'; labelKey: StringKey }[]

type SectionId = 'account' | 'ai' | 'wechat' | 'knowledge' | 'general' | 'about'

const SECTIONS: readonly { id: SectionId; labelKey?: StringKey }[] = [
  { id: 'ai' },
  { id: 'wechat', labelKey: 'setSecWechat' },
  { id: 'knowledge' },
  { id: 'general', labelKey: 'setSecGeneral' },
  { id: 'about', labelKey: 'setSecAbout' },
]

function SectionIcon({ id }: { id: SectionId }) {
  if (id === 'account') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.2" r="2.9" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M2.7 13.6a5.5 5.5 0 0 1 10.6 0"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'general') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 5h8M13 5h1M2 11h1M6 11h8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="11.5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }
  if (id === 'ai') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 1.8l1.1 3.1L12.2 6l-3.1 1.1L8 10.2 6.9 7.1 3.8 6l3.1-1.1L8 1.8zM12.4 10l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (id === 'wechat') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3.2 4.2h9.6c.8 0 1.4.6 1.4 1.3v5c0 .7-.6 1.3-1.4 1.3H8.6L5.8 13.6V11.8H3.2c-.8 0-1.4-.6-1.4-1.3v-5c0-.7.6-1.3 1.4-1.3z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (id === 'knowledge') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3 3.2C3 2.5 5.2 2 8 2s5 .5 5 1.2v9.6c0 .7-2.2 1.2-5 1.2s-5-.5-5-1.2V3.2z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M3 6.4c0 .7 2.2 1.2 5 1.2s5-.5 5-1.2M3 9.6c0 .7 2.2 1.2 5 1.2s5-.5 5-1.2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.4v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  )
}

/** label-over-value field row with an optional right-aligned action */
function Field({
  label,
  value,
  valueTitle,
  action,
}: {
  label: string
  value: string
  valueTitle?: string
  action?: ReactNode
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-label">{label}</div>
        <div className="set-field-value" data-tip={valueTitle}>
          {value}
        </div>
      </div>
      {action}
    </div>
  )
}

export interface SettingsModalProps {
  status: AccountStatus | null
  loggingOut: boolean
  /** browser sign-in in progress (spinner shows on the account entry) */
  loginWaiting: boolean
  /** device auth URL while waiting — rescue actions when the browser did not auto-open */
  loginUrl: string | null
  urlCopied: boolean
  onOpenLoginUrl: () => void
  onCopyLoginUrl: () => void
  onClose: () => void
  /** closes the modal and launches the ZenMux login flow (progress shows on the account entry) */
  onLogin: () => void
  onLogout: () => void
}

export function SettingsModal({
  status,
  loggingOut,
  loginWaiting,
  loginUrl,
  urlCopied,
  onOpenLoginUrl,
  onCopyLoginUrl,
  onClose,
  onLogin,
  onLogout,
}: SettingsModalProps) {
  const { lang, setLang, t } = useI18n()
  const [section, setSection] = useState<SectionId>('ai')
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [appVersion, setAppVersion] = useState('')
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(ZENMUX_BASE_URL)
  const [model, setModel] = useState<string>(ZENMUX_MODELS[0])
  const [models, setModels] = useState<string[]>([...ZENMUX_MODELS])
  const [removedModels, setRemovedModels] = useState<string[]>([])
  const [newModel, setNewModel] = useState('')
  const [imageModel, setImageModel] = useState<string>(ZENMUX_IMAGE_MODELS[0])
  const [imageModels, setImageModels] = useState<string[]>([...ZENMUX_IMAGE_MODELS])
  const [removedImageModels, setRemovedImageModels] = useState<string[]>([])
  const [newImageModel, setNewImageModel] = useState('')
  const [aiSaved, setAiSaved] = useState(false)
  const [knowledgeSettings, setKnowledgeSettings] = useState<KnowledgeSettingsItem | null>(null)
  const [memories, setMemories] = useState<KnowledgeMemoryItem[]>([])
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [wechat, setWechat] = useState<WechatDiaryStatus | null>(null)
  const [wechatPair, setWechatPair] = useState('')

  useEffect(() => {
    let alive = true
    void window.aiOffice.getTheme?.().then((th) => {
      if (alive) setTheme(th)
    })
    void window.aiOffice.getDefaultSaveDir?.().then((dir) => {
      if (alive && dir) setSaveDir(dir)
    })
    void window.aiOffice.getUpdateChannel?.().then((ch) => {
      if (alive) setChannel(ch)
    })
    void window.aiOffice.getAppVersion?.().then((v) => {
      if (alive && v) setAppVersion(v)
    })
    void window.aiOffice.getAiSettings?.().then((settings) => {
      if (!alive) return
      const config = settings.providers.zenmux
      const activeModel = config.model || ZENMUX_MODELS[0]
      const savedModels = config.models ?? []
      const savedRemovedModels = config.removedModels ?? []
      setAiSettings(settings)
      setApiKey(config.apiKey)
      setBaseUrl(config.baseUrl?.trim() || ZENMUX_BASE_URL)
      setModel(activeModel)
      setRemovedModels(savedRemovedModels)
      setModels(resolveModelOptions(ZENMUX_MODELS, savedModels, savedRemovedModels, activeModel))
      const savedImageModels = config.imageModels ?? []
      const savedRemovedImageModels = config.removedImageModels ?? []
      const activeImageModel = config.imageModel || ZENMUX_IMAGE_MODELS[0]
      setImageModel(activeImageModel)
      setRemovedImageModels(savedRemovedImageModels)
      setImageModels(
        resolveModelOptions(
          ZENMUX_IMAGE_MODELS,
          savedImageModels,
          savedRemovedImageModels,
          activeImageModel,
        ),
      )
    })
    void window.aiOfficeProject?.getKnowledgeSettings().then((settings) => {
      if (alive) setKnowledgeSettings(settings)
    })
    void window.aiOffice.wechatDiary?.status().then((st) => {
      if (alive) setWechat(st)
    })
    void window.aiOfficeProject?.listKnowledge('', 100).then((items) => {
      if (alive) setMemories(items)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => window.aiOffice.wechatDiary?.onChanged(setWechat) ?? (() => {}), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const applyTheme = (next: UiTheme) => {
    setTheme(next)
    void window.aiOffice.setTheme(next)
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  }

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  const loggedIn = status?.loggedIn ?? false
  const email = status?.email ?? ''
  const isChinese = lang === 'zh' || lang === 'zh-TW'
  const aiLabel = isChinese ? 'AI 模型' : 'AI Models'
  const knowledgeLabel = isChinese ? '个人知识库' : 'Personal Knowledge'

  const refreshMemories = (query = knowledgeQuery) => {
    void window.aiOfficeProject?.listKnowledge(query, 100).then(setMemories)
  }

  const updateKnowledgeSettings = (patch: Partial<KnowledgeSettingsItem>) => {
    if (!knowledgeSettings) return
    const optimistic = { ...knowledgeSettings, ...patch }
    setKnowledgeSettings(optimistic)
    void window.aiOfficeProject?.setKnowledgeSettings(patch).then(setKnowledgeSettings)
  }

  const addModel = () => {
    const next = newModel.trim()
    if (!next) return
    setModels((current) => (current.includes(next) ? current : [...current, next]))
    setRemovedModels((current) => current.filter((name) => name !== next))
    setModel(next)
    setNewModel('')
    setAiSaved(false)
  }

  const addImageModel = () => {
    const next = newImageModel.trim()
    if (!next) return
    setImageModels((current) => (current.includes(next) ? current : [...current, next]))
    setRemovedImageModels((current) => current.filter((name) => name !== next))
    setImageModel(next)
    setNewImageModel('')
    setAiSaved(false)
  }

  const deleteModel = () => {
    const result = removeActiveModel(models, model)
    if (!result) return
    setRemovedModels((current) => [...new Set([...current, model])])
    setModels(result.models)
    setModel(result.active)
    setAiSaved(false)
  }

  const deleteImageModel = () => {
    const result = removeActiveModel(imageModels, imageModel)
    if (!result) return
    setRemovedImageModels((current) => [...new Set([...current, imageModel])])
    setImageModels(result.models)
    setImageModel(result.active)
    setAiSaved(false)
  }

  const saveAiSettings = () => {
    if (!aiSettings) return
    const next: AiSettings = {
      ...aiSettings,
      provider: 'zenmux',
      providers: {
        ...aiSettings.providers,
        zenmux: {
          apiKey: apiKey.trim(),
          model,
          models,
          removedModels,
          imageModel,
          imageModels,
          removedImageModels,
          baseUrl: baseUrl.trim().replace(/\/+$/, '') || ZENMUX_BASE_URL,
        },
      },
    }
    void window.aiOffice.setAiSettings(next).then(() => {
      setAiSettings(next)
      setAiSaved(true)
    })
  }

  return (
    <div
      className="set-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="set-dialog" role="dialog" aria-modal="true" aria-label={t('settings')}>
        <div className="set-header">
          <h2 className="set-title">{t('settings')}</h2>
          <button className="set-close" onClick={onClose} aria-label={t('cancel')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="set-body">
          <nav className="set-nav" aria-label={t('settings')}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`set-nav-item${section === s.id ? ' active' : ''}`}
                aria-current={section === s.id}
                onClick={() => setSection(s.id)}
              >
                <SectionIcon id={s.id} />
                {s.labelKey ? t(s.labelKey) : s.id === 'knowledge' ? knowledgeLabel : aiLabel}
              </button>
            ))}
          </nav>
          <div className="set-pane">
            {section === 'account' && (
              <>
                <h3 className="set-pane-title">{t('setSecAccount')}</h3>
                <Field label={t('setEmail')} value={loggedIn ? email : t('setNotLoggedIn')} />
                {loggedIn && (
                  <Field
                    label={t('credits')}
                    value={
                      status?.creditBalance === undefined
                        ? '—'
                        : Math.floor(status.creditBalance).toLocaleString('en-US')
                    }
                    action={
                      <button
                        className="set-btn"
                        data-tip={t('creditsTip')}
                        onClick={() => void window.aiOffice.openCreditUsage?.()}
                      >
                        {t('setViewUsage')}
                      </button>
                    }
                  />
                )}
                <div className="set-pane-footer">
                  {loggedIn ? (
                    <button className="set-btn danger" disabled={loggingOut} onClick={onLogout}>
                      {loggingOut ? t('loggingOut') : t('logout')}
                    </button>
                  ) : (
                    <>
                      {loginWaiting && loginUrl && (
                        <>
                          <button className="set-btn" onClick={onOpenLoginUrl}>
                            {t('loginOpenManually')}
                          </button>
                          <button className="set-btn" onClick={onCopyLoginUrl}>
                            {urlCopied ? t('loginCopied') : t('loginCopyUrl')}
                          </button>
                        </>
                      )}
                      <button className="set-btn primary" onClick={onLogin}>
                        {loginWaiting ? t('waitingShort') : t('loginZenMux')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {section === 'wechat' && (
              <>
                <h3 className="set-pane-title">{t('setSecWechat')}</h3>
                <div className="set-ai-help">
                  {isChinese
                    ? '用手机微信扫描绑定二维码（需微信 8.0.70+ 的官方 ClawBot 插件）。文字和图片会写入「三天窗口」Markdown；纯图片累计 5 张后统一分析，或在图片后发送问题立即提问。AI 回复也会追加进同一篇。'
                    : 'Scan with WeChat (8.0.70+ official ClawBot). Text and images are saved in a 3-day Markdown window. Five image-only messages are analyzed together, or send a question after images to flush the batch. AI replies are appended to the same file.'}
                </div>
                <div className="set-check-row">
                  <input
                    id="wechat-enabled"
                    type="checkbox"
                    checked={wechat?.enabled !== false}
                    onChange={(e) =>
                      void window.aiOffice.wechatDiary
                        .setPrefs({ enabled: e.target.checked })
                        .then(setWechat)
                    }
                  />
                  <label htmlFor="wechat-enabled">
                    {isChinese
                      ? '启用接收（应用运行时监听）'
                      : 'Enable inbox while the app is running'}
                  </label>
                </div>
                <div className="set-check-row">
                  <input
                    id="wechat-ai"
                    type="checkbox"
                    checked={wechat?.aiEnabled !== false}
                    onChange={(e) =>
                      void window.aiOffice.wechatDiary
                        .setPrefs({ aiEnabled: e.target.checked })
                        .then(setWechat)
                    }
                  />
                  <label htmlFor="wechat-ai">
                    {isChinese
                      ? '微信对话走当前系统 AI（ZenMux / 自定义网关）'
                      : 'Talk to the current system AI (ZenMux / custom gateway)'}
                  </label>
                </div>
                <Field
                  label={isChinese ? '绑定状态' : 'Binding'}
                  value={
                    wechat?.bound
                      ? isChinese
                        ? `已绑定${wechat.userLabel ? ` · ${wechat.userLabel}` : ''}${
                            wechat.listening ? ' · 监听中' : ''
                          }`
                        : `Bound${wechat.userLabel ? ` · ${wechat.userLabel}` : ''}${
                            wechat.listening ? ' · listening' : ''
                          }`
                      : wechat?.bindPhase === 'wait'
                        ? isChinese
                          ? '等待扫码'
                          : 'Waiting for scan'
                        : wechat?.bindPhase === 'scaned'
                          ? isChinese
                            ? '已扫码，请在手机上确认'
                            : 'Scanned — confirm on the phone'
                          : wechat?.bindPhase === 'need_pair'
                            ? isChinese
                              ? '需要配对码'
                              : 'Pairing code required'
                            : wechat?.bindPhase === 'expired'
                              ? isChinese
                                ? '二维码已过期'
                                : 'QR expired'
                              : isChinese
                                ? '未绑定'
                                : 'Not bound'
                  }
                />
                {wechat?.qrDataUrl && (
                  <div className="set-wechat-qr">
                    <img
                      src={wechat.qrDataUrl}
                      alt={isChinese ? '微信绑定二维码' : 'WeChat bind QR'}
                    />
                    <div className="set-ai-help">
                      {isChinese
                        ? '微信扫一扫此码。插件页若显示「暂无可用插件」，仍可直接扫码。'
                        : 'Scan with WeChat. You can scan even if the plugin list is empty.'}
                    </div>
                    {wechat.qrOpenUrl && (
                      <button
                        className="set-btn"
                        type="button"
                        onClick={() => void window.aiOffice.wechatDiary.openQrUrl()}
                      >
                        {isChinese ? '在浏览器打开绑定链接' : 'Open bind link in browser'}
                      </button>
                    )}
                  </div>
                )}
                {wechat?.bindPhase === 'need_pair' && (
                  <label className="set-ai-field" htmlFor="wechat-pair">
                    <span>{wechat.pairHint || (isChinese ? '配对数字' : 'Pairing code')}</span>
                    <div className="set-ai-add-row">
                      <input
                        id="wechat-pair"
                        className="set-input"
                        value={wechatPair}
                        onChange={(e) => setWechatPair(e.target.value)}
                      />
                      <button
                        className="set-btn"
                        type="button"
                        onClick={() =>
                          void window.aiOffice.wechatDiary.submitPair(wechatPair).then(setWechat)
                        }
                      >
                        {isChinese ? '提交' : 'Submit'}
                      </button>
                    </div>
                  </label>
                )}
                {wechat?.lastError && <div className="set-ai-help">{wechat.lastError}</div>}
                <div className="set-pane-footer">
                  <button
                    className="set-btn"
                    type="button"
                    onClick={() => void window.aiOffice.wechatDiary.startBind().then(setWechat)}
                  >
                    {isChinese ? '生成绑定二维码' : 'Generate bind QR'}
                  </button>
                  {wechat?.bound && (
                    <button
                      className="set-btn danger"
                      type="button"
                      onClick={() => void window.aiOffice.wechatDiary.unbind().then(setWechat)}
                    >
                      {isChinese ? '解除绑定' : 'Unbind'}
                    </button>
                  )}
                </div>
                <Field
                  label={isChinese ? '日记目录' : 'Diary folder'}
                  value={wechat?.diaryDir || '—'}
                  valueTitle={wechat?.diaryDir}
                  action={
                    <button
                      className="set-btn"
                      type="button"
                      onClick={() => void window.aiOffice.wechatDiary.pickDir().then(setWechat)}
                    >
                      {t('setChange')}
                    </button>
                  }
                />
                <div className="set-ai-help">
                  {isChinese
                    ? '文件名形如 2026-08-27~08-29.md（每三天一篇，凌晨 4 点前算前一天）。发「记：…」只入库；直接对话会调用当前 AI；「撤回」「结束」「帮助」为命令。'
                    : 'Files look like 2026-08-27~08-29.md (one file per 3 days; before 4:00 a.m. counts as the previous day). “记：…” saves only; free text talks to the current AI; 撤回 / 结束 / 帮助 are commands.'}
                </div>
                <div className="set-pane-footer">
                  <button
                    className="set-btn"
                    type="button"
                    disabled={!wechat?.lastFile}
                    onClick={() => void window.aiOffice.wechatDiary.openLatest()}
                  >
                    {isChinese ? '打开当前日记' : 'Open current diary'}
                  </button>
                </div>
              </>
            )}
            {section === 'general' && (
              <>
                <h3 className="set-pane-title">{t('setSecGeneral')}</h3>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-lang">
                      {t('language')}
                    </label>
                  </div>
                  <select
                    id="set-lang"
                    className="set-select"
                    value={lang}
                    onChange={(e) => setLang(e.target.value as typeof lang)}
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="set-ai-help set-language-ai-help">
                  {isChinese
                    ? '该语言也是 AI 的默认回复语言；如果您本次使用另一种语言提问，AI 会跟随提问语言。'
                    : 'This is also the default AI reply language. If you ask in another language, AI follows the language of that request.'}
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-theme">
                      {t('theme')}
                    </label>
                  </div>
                  <select
                    id="set-theme"
                    className="set-select"
                    value={theme}
                    onChange={(e) => applyTheme(e.target.value as UiTheme)}
                  >
                    {THEME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  label={t('saveLocation')}
                  value={saveDir || '—'}
                  valueTitle={saveDir}
                  action={
                    <button className="set-btn" onClick={changeSaveDir}>
                      {t('setChange')}
                    </button>
                  }
                />
              </>
            )}
            {section === 'ai' && (
              <>
                <h3 className="set-pane-title">ZenMux</h3>
                <label className="set-ai-field" htmlFor="set-zenmux-key">
                  <span>{isChinese ? 'API Key（本机永久保存）' : 'API Key (saved locally)'}</span>
                  <input
                    id="set-zenmux-key"
                    className="set-input"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    placeholder="ZenMux API Key"
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setAiSaved(false)
                    }}
                  />
                </label>
                <div className="set-ai-help">
                  {isChinese ? '没有 API Key？' : "Don't have an API Key?"}{' '}
                  <button
                    className="set-link"
                    onClick={() => void window.aiOffice.openZenMuxInvite()}
                  >
                    {isChinese ? '使用邀请链接注册 ZenMux' : 'Create one with the ZenMux invite'}
                  </button>
                </div>
                <div className="set-ai-help">
                  {isChinese
                    ? '提示：AI 功能依赖网络，网络或代理状态可能影响可用性、速度与生成结果。'
                    : 'Note: AI features depend on network access. Network or proxy conditions may affect availability, speed, and results.'}
                </div>
                <label className="set-ai-field" htmlFor="set-zenmux-url">
                  <span>Base URL</span>
                  <div className="set-ai-add-row">
                    <input
                      id="set-zenmux-url"
                      className="set-input"
                      value={baseUrl}
                      placeholder={ZENMUX_BASE_URL}
                      spellCheck={false}
                      onChange={(e) => {
                        setBaseUrl(e.target.value)
                        setAiSaved(false)
                      }}
                    />
                    <button
                      className="set-btn"
                      type="button"
                      disabled={baseUrl.trim().replace(/\/+$/, '') === ZENMUX_BASE_URL}
                      onClick={() => {
                        setBaseUrl(ZENMUX_BASE_URL)
                        setAiSaved(false)
                      }}
                    >
                      {isChinese ? '恢复默认' : 'Reset'}
                    </button>
                  </div>
                </label>
                <div className="set-ai-help">
                  {isChinese
                    ? '默认走 ZenMux。可改为任意 OpenAI 兼容网关的 Base URL；API Key 与模型名按该网关填写。'
                    : 'ZenMux is the default. You can point this at any OpenAI-compatible Base URL; use that gateway’s API Key and model names.'}
                </div>
                <div className="set-ai-field">
                  <span>{isChinese ? '当前模型' : 'Active model'}</span>
                  <div className="set-ai-model-row">
                    <select
                      id="set-zenmux-model"
                      className="set-input"
                      aria-label={isChinese ? '当前文本模型' : 'Active text model'}
                      value={model}
                      onChange={(e) => {
                        setModel(e.target.value)
                        setAiSaved(false)
                      }}
                    >
                      {models.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="set-btn danger"
                      onClick={deleteModel}
                      disabled={models.length <= 1}
                      title={
                        models.length <= 1
                          ? isChinese
                            ? '至少保留一个文本模型'
                            : 'Keep at least one text model'
                          : isChinese
                            ? `删除 ${model}`
                            : `Delete ${model}`
                      }
                    >
                      {isChinese ? '删除' : 'Delete'}
                    </button>
                  </div>
                </div>
                <div className="set-ai-field">
                  <label htmlFor="set-zenmux-new-model">
                    {isChinese ? '增加模型名称' : 'Add model name'}
                  </label>
                  <div className="set-ai-add-row">
                    <input
                      id="set-zenmux-new-model"
                      className="set-input"
                      value={newModel}
                      placeholder="provider/model-name"
                      onChange={(e) => setNewModel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addModel()
                      }}
                    />
                    <button className="set-btn" onClick={addModel} disabled={!newModel.trim()}>
                      {isChinese ? '增加' : 'Add'}
                    </button>
                  </div>
                </div>
                <div className="set-ai-field">
                  <span>{isChinese ? '配图模型（PPT / Word）' : 'Image model (PPT / Word)'}</span>
                  <div className="set-ai-model-row">
                    <select
                      id="set-zenmux-image-model"
                      className="set-input"
                      aria-label={isChinese ? '当前配图模型' : 'Active image model'}
                      value={imageModel}
                      onChange={(e) => {
                        setImageModel(e.target.value)
                        setAiSaved(false)
                      }}
                    >
                      {imageModels.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="set-btn danger"
                      onClick={deleteImageModel}
                      disabled={imageModels.length <= 1}
                      title={
                        imageModels.length <= 1
                          ? isChinese
                            ? '至少保留一个配图模型'
                            : 'Keep at least one image model'
                          : isChinese
                            ? `删除 ${imageModel}`
                            : `Delete ${imageModel}`
                      }
                    >
                      {isChinese ? '删除' : 'Delete'}
                    </button>
                  </div>
                </div>
                <div className="set-ai-field">
                  <label htmlFor="set-zenmux-new-image-model">
                    {isChinese ? '增加配图模型名称' : 'Add image model name'}
                  </label>
                  <div className="set-ai-add-row">
                    <input
                      id="set-zenmux-new-image-model"
                      className="set-input"
                      value={newImageModel}
                      placeholder="provider/image-model-name"
                      onChange={(e) => setNewImageModel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addImageModel()
                      }}
                    />
                    <button
                      className="set-btn"
                      onClick={addImageModel}
                      disabled={!newImageModel.trim()}
                    >
                      {isChinese ? '增加' : 'Add'}
                    </button>
                  </div>
                </div>
                <div className="set-pane-footer">
                  {aiSaved && <span className="set-saved">{isChinese ? '已保存' : 'Saved'}</span>}
                  <button
                    className="set-btn primary"
                    onClick={saveAiSettings}
                    disabled={!aiSettings || !model}
                  >
                    {isChinese ? '保存' : 'Save'}
                  </button>
                </div>
              </>
            )}
            {section === 'knowledge' && (
              <>
                <h3 className="set-pane-title">{knowledgeLabel}</h3>
                <div className="set-ai-help">
                  {isChinese
                    ? 'AI 成功回答会保存在本机并形成可搜索记忆。只有与当前问题相关的少量片段会随本次请求发送给 ZenMux；完整知识库不会上传。历史回答可能过时或有误，您可以随时关闭、删除或清空。'
                    : 'Successful AI answers are saved locally as searchable memories. Only a few relevant excerpts are sent to ZenMux with the current request; the complete library is never uploaded. Memories may be outdated or wrong and can be disabled or deleted at any time.'}
                </div>
                {knowledgeSettings && (
                  <div className="set-knowledge-options">
                    <label className="set-check-row">
                      <input
                        type="checkbox"
                        checked={knowledgeSettings.autoCapture}
                        onChange={(event) =>
                          updateKnowledgeSettings({ autoCapture: event.target.checked })
                        }
                      />
                      <span>
                        {isChinese
                          ? '自动保存成功的 AI 问答'
                          : 'Automatically save completed AI conversations'}
                      </span>
                    </label>
                    <label className="set-check-row">
                      <input
                        type="checkbox"
                        checked={knowledgeSettings.useForReplies}
                        onChange={(event) =>
                          updateKnowledgeSettings({ useForReplies: event.target.checked })
                        }
                      />
                      <span>
                        {isChinese
                          ? '回答前检索本地记忆（本地 RAG）'
                          : 'Retrieve local memories before replying (local RAG)'}
                      </span>
                    </label>
                    <label className="set-check-row">
                      <input
                        type="checkbox"
                        checked={knowledgeSettings.sameProjectBoost}
                        onChange={(event) =>
                          updateKnowledgeSettings({ sameProjectBoost: event.target.checked })
                        }
                      />
                      <span>
                        {isChinese
                          ? '优先当前文件与项目的记忆'
                          : 'Prefer memories from the current file and project'}
                      </span>
                    </label>
                    <label className="set-ai-field" htmlFor="set-memory-limit">
                      <span>
                        {isChinese ? '每次最多引用的记忆条数' : 'Maximum memories per request'}
                      </span>
                      <input
                        id="set-memory-limit"
                        className="set-input"
                        type="number"
                        min={1}
                        max={10}
                        value={knowledgeSettings.maxResults}
                        onChange={(event) =>
                          updateKnowledgeSettings({ maxResults: Number(event.target.value) || 1 })
                        }
                      />
                    </label>
                  </div>
                )}
                <div className="set-ai-add-row set-knowledge-search">
                  <input
                    className="set-input"
                    value={knowledgeQuery}
                    placeholder={
                      isChinese ? '搜索问题、回答或主题' : 'Search questions, answers, or topics'
                    }
                    onChange={(event) => setKnowledgeQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') refreshMemories()
                    }}
                  />
                  <button className="set-btn" onClick={() => refreshMemories()}>
                    {isChinese ? '搜索' : 'Search'}
                  </button>
                </div>
                <div className="set-knowledge-list">
                  {memories.length === 0 && (
                    <div className="set-ai-help">
                      {isChinese ? '暂无匹配的本地记忆。' : 'No matching local memories.'}
                    </div>
                  )}
                  {memories.map((memory) => (
                    <article className="set-knowledge-card" key={memory.id}>
                      <div className="set-knowledge-card-head">
                        <strong>{memory.question}</strong>
                        <button
                          className="set-btn danger"
                          onClick={() =>
                            void window.aiOfficeProject
                              ?.deleteKnowledge(memory.id)
                              .then(() => refreshMemories())
                          }
                        >
                          {isChinese ? '删除' : 'Delete'}
                        </button>
                      </div>
                      <p>{memory.answer}</p>
                      <small>
                        {new Date(memory.createdAt).toLocaleString()}
                        {memory.sourceFile ? ` · ${memory.sourceFile}` : ''}
                      </small>
                    </article>
                  ))}
                </div>
                <div className="set-pane-footer">
                  <button
                    className="set-btn danger"
                    disabled={memories.length === 0}
                    onClick={() => {
                      const confirmed = window.confirm(
                        isChinese
                          ? '确定清空全部个人知识库？此操作无法撤销。'
                          : 'Clear the entire personal knowledge base? This cannot be undone.',
                      )
                      if (confirmed)
                        void window.aiOfficeProject?.clearKnowledge().then(() => refreshMemories())
                    }}
                  >
                    {isChinese ? '清空知识库' : 'Clear knowledge base'}
                  </button>
                </div>
              </>
            )}
            {section === 'about' && (
              <>
                <h3 className="set-pane-title">{t('setSecAbout')}</h3>
                <Field label={t('versionLabel')} value={appVersion || '—'} />
                <div className="set-about-credit">
                  <strong>AI 适配与修改 / AI adaptation and modifications</strong>
                  <p>
                    由复旦大学计算与智能创新学院徐志平完成 AI 适配与修改，并重新制作 macOS DMG。
                  </p>
                  <p>
                    AI adaptation and modifications by Zhiping Xu, College of Computer Science and
                    Artificial Intelligence, Fudan University; macOS DMG rebuilt for this release.
                  </p>
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-channel">
                      {t('updateChannel')}
                    </label>
                  </div>
                  <select
                    id="set-channel"
                    className="set-select"
                    value={channel}
                    onChange={(e) => {
                      const next = e.target.value === 'beta' ? 'beta' : 'stable'
                      setChannel(next)
                      void window.aiOffice.setUpdateChannel(next)
                    }}
                  >
                    {CHANNEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
