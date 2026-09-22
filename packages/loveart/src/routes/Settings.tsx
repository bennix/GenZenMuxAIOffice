import { useState } from 'react'
import TopNav from '../components/TopNav'
import { INVITE_URL, useSettings } from '../store/settingsStore'
import { testApiKey } from '../services/zenmux'
import { useT } from '../i18n'
import type { ModelCategory } from '../types'

function maskKey(key: string): string {
  if (key.length <= 6) return '••••••'
  return `${key.slice(0, 3)}••••••${key.slice(-4)}`
}

export default function Settings() {
  const {
    apiKey,
    models,
    lang,
    theme,
    setApiKey,
    setLang,
    setTheme,
    addModel,
    removeModel,
    setDefault,
    clearAll,
  } = useSettings()
  const t = useT()
  const [draftKey, setDraftKey] = useState(apiKey)
  const [reveal, setReveal] = useState(false)
  const [newId, setNewId] = useState('')
  const [newCat, setNewCat] = useState<ModelCategory>('image')
  const [testState, setTestState] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'fail'
    message: string
  }>({
    status: 'idle',
    message: '',
  })

  const section: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-card)',
    padding: 20,
    marginBottom: 20,
  }
  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-input)',
    border: '1px solid var(--border)',
    padding: '6px 12px',
  }

  const saveKey = async (key: string) => {
    try {
      await window.loveArtOffice?.saveApiKey?.(key.trim())
      setApiKey(key)
      setTestState({ status: 'ok', message: '已保存到 Office 的 AI 设置。' })
    } catch (error) {
      setTestState({ status: 'fail', message: String(error) })
    }
  }

  const runTest = async () => {
    // Test the draft if the user typed one, else the saved key.
    const keyToTest = reveal || draftKey ? draftKey : apiKey
    setTestState({ status: 'testing', message: t('testing') })
    const result = await testApiKey(keyToTest)
    setTestState({ status: result.ok ? 'ok' : 'fail', message: result.message })
  }

  return (
    <div>
      <TopNav />
      <main style={{ maxWidth: 760, margin: '24px auto', padding: '0 20px' }}>
        <h2>{t('settings')}</h2>

        {/* API Key */}
        <section style={section}>
          <h3 style={{ marginTop: 0 }}>{t('apiKey')}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type={reveal ? 'text' : 'password'}
              value={reveal ? draftKey : apiKey ? maskKey(apiKey) : draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              onFocus={() => setReveal(true)}
              placeholder="zk-..."
              style={{ flex: 1, minWidth: 200 }}
            />
            <button className="btn-ghost" onClick={() => setReveal((r) => !r)}>
              {reveal ? `🙈 ${t('hide')}` : `👁 ${t('show')}`}
            </button>
            <button className="btn-accent" onClick={() => void saveKey(draftKey)}>
              {t('save')}
            </button>
            <button
              className="btn-ghost"
              onClick={runTest}
              disabled={testState.status === 'testing'}
            >
              {testState.status === 'testing' ? t('testing') : t('test')}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                void saveKey('')
                setDraftKey('')
                setTestState({ status: 'idle', message: '' })
              }}
            >
              {t('clear')}
            </button>
          </div>

          {testState.status !== 'idle' && testState.status !== 'testing' && (
            <p
              style={{
                fontSize: 13,
                marginBottom: 0,
                color: testState.status === 'ok' ? 'var(--success)' : 'var(--danger)',
              }}
            >
              {testState.status === 'ok' ? '✓' : '✗'} {testState.message}
            </p>
          )}

          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            {t('noKeyHelper')}{' '}
            <a href={INVITE_URL} target="_blank" rel="noreferrer">
              {INVITE_URL}
            </a>
          </p>
        </section>

        {/* Models */}
        <section style={section}>
          <h3 style={{ marginTop: 0 }}>{t('models')}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '6px 4px' }}>{t('colModel')}</th>
                <th>{t('colCategory')}</th>
                <th>{t('colDefault')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 4px' }}>
                    <div>{m.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {m.id}
                    </div>
                  </td>
                  <td>{m.category}</td>
                  <td>
                    <input
                      type="radio"
                      name={`default-${m.category}`}
                      checked={!!m.isDefault}
                      onChange={() => setDefault(m.id)}
                    />
                  </td>
                  <td>
                    <button className="muted" onClick={() => removeModel(m.id)} title="Remove">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder={t('modelIdPlaceholder')}
              style={{ flex: 1 }}
            />
            <select
              value={newCat}
              onChange={(e) => setNewCat(e.target.value as ModelCategory)}
              style={selectStyle}
            >
              <option value="image">image</option>
              <option value="video">video</option>
              <option value="chat">chat</option>
            </select>
            <button
              className="btn-ghost"
              onClick={() => {
                if (!newId.trim()) return
                addModel({ id: newId.trim(), name: newId.trim(), category: newCat })
                setNewId('')
              }}
            >
              {t('addModel')}
            </button>
          </div>
        </section>

        {/* Appearance + Data */}
        <section style={section}>
          <h3 style={{ marginTop: 0 }}>{t('appearanceData')}</h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>{t('language')}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as 'zh' | 'en')}
              style={selectStyle}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
            <span style={{ marginLeft: 12 }}>{t('theme')}</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
              style={selectStyle}
            >
              <option value="system">{t('system')}</option>
              <option value="dark">{t('dark')}</option>
              <option value="light">{t('light')}</option>
            </select>
          </div>
          <button className="btn-ghost" onClick={() => confirm(t('clearConfirm')) && clearAll()}>
            {t('clearAllData')}
          </button>
        </section>
      </main>
    </div>
  )
}
