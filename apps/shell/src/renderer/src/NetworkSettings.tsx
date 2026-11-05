import { useEffect, useState } from 'react'
import type { AiNetworkPreferences, AiNetworkStatus } from '@genoffice/ai-provider'

export function NetworkSettings({ zh }: { zh: boolean }) {
  const [preferences, setPreferences] = useState<AiNetworkPreferences>({ mode: 'auto' })
  const [status, setStatus] = useState<AiNetworkStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    window.aiOffice
      .getAiNetworkSettings()
      .then((result) => {
        if (active) {
          setPreferences(result.preferences)
          setStatus(result.status)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (active)
          setNotice(zh ? '无法读取网络设置，请重试。' : 'Unable to load network settings.')
      })
    const refresh = setInterval(() => {
      void window.aiOffice
        .getAiNetworkSettings()
        .then((result) => {
          if (active) setStatus(result.status)
        })
        .catch(() => {
          /* Keep the last status while a host reloads. */
        })
    }, 5000)
    return () => {
      active = false
      clearInterval(refresh)
    }
  }, [zh])
  async function saveAndCheck(check: boolean) {
    setBusy(true)
    setNotice('')
    try {
      const saved = await window.aiOffice.setAiNetworkSettings(preferences)
      setPreferences(saved.preferences)
      setStatus(saved.status)
      if (check) {
        const result = await window.aiOffice.checkAiNetwork()
        setStatus(result.status)
        setNotice(
          result.ok
            ? zh
              ? `服务可达${result.httpStatus ? `（HTTP ${result.httpStatus}）` : ''}。未测试 API 密钥或长时间生成。`
              : `Service reachable${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}. API credentials and long-running generation were not tested.`
            : zh
              ? '连接未通过。请检查代理软件、端口和网络，再重新检测。'
              : 'Connection failed. Check your proxy, port and network, then retry.',
        )
      } else
        setNotice(
          zh
            ? '已保存，下一次 AI 请求生效；不会中断正在生成的任务。'
            : 'Saved for the next AI request. Active generation is not interrupted.',
        )
    } catch {
      setNotice(
        zh
          ? '保存或检测失败。手动代理请使用不含账号密码的 http://、https:// 或 socks5:// 地址。'
          : 'Save or check failed. Use an HTTP, HTTPS or SOCKS5 proxy address without credentials.',
      )
    } finally {
      setBusy(false)
    }
  }
  const route = status?.mode.startsWith('local-proxy')
    ? zh
      ? '本机代理'
      : 'Local proxy'
    : status?.mode.startsWith('environment-proxy')
      ? zh
        ? '环境代理'
        : 'Environment proxy'
      : status?.mode === 'manual-proxy'
        ? zh
          ? '手动代理'
          : 'Manual proxy'
        : status?.mode === 'system'
          ? zh
            ? '系统网络／代理'
            : 'System network / proxy'
          : status?.mode === 'direct'
            ? zh
              ? '直连'
              : 'Direct'
            : '—'
  return (
    <section>
      <h3 className="set-pane-title">{zh ? '网络与代理' : 'Network & proxy'}</h3>
      <p className="set-note">
        {zh
          ? '统一用于内置 AI 聊天、文档、PPT、图片／视频及搜索。自动模式会检测系统代理和本机常见代理端口，并在后续请求中适应网络变化。'
          : 'Shared by built-in AI chat, documents, slides, images/videos and search. Automatic mode detects system and common local proxies and adapts subsequent requests.'}
      </p>
      <div className="set-field">
        <label htmlFor="ai-network-mode">{zh ? '连接方式' : 'Connection mode'}</label>
        <select
          id="ai-network-mode"
          className="set-select"
          disabled={busy || !loaded}
          value={preferences.mode}
          onChange={(event) =>
            setPreferences({
              ...preferences,
              mode: event.target.value as AiNetworkPreferences['mode'],
            })
          }
        >
          <option value="auto">{zh ? '自动检测（推荐）' : 'Automatic (recommended)'}</option>
          <option value="system">
            {zh ? '仅使用系统网络／代理' : 'System network / proxy only'}
          </option>
          <option value="direct">{zh ? '仅直连' : 'Direct only'}</option>
          <option value="manual">{zh ? '手动代理' : 'Manual proxy'}</option>
        </select>
      </div>
      {preferences.mode === 'manual' && (
        <div className="set-field">
          <label htmlFor="ai-network-proxy">{zh ? '代理地址' : 'Proxy address'}</label>
          <input
            id="ai-network-proxy"
            className="set-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={preferences.proxyUrl ?? ''}
            placeholder="http://127.0.0.1:7890"
            onChange={(event) => setPreferences({ ...preferences, proxyUrl: event.target.value })}
          />
        </div>
      )}
      <div className="set-field">
        <span>{zh ? '最近使用的线路' : 'Last selected route'}</span>
        <strong>{route}</strong>
      </div>
      <div className="set-field">
        <span>{zh ? '最近检测' : 'Last check'}</span>
        <span>
          {status?.checkedAt
            ? new Date(status.checkedAt).toLocaleString()
            : zh
              ? '尚未检测'
              : 'Not checked'}
        </span>
      </div>
      <p className="set-note">
        {zh
          ? '检测不发送密钥、提示词或文件。手动代理不支持在地址中填写账号密码。'
          : 'Checks send no API key, prompt or file. Credentials in proxy URLs are not supported.'}
      </p>
      <div className="set-pane-footer">
        <button
          className="set-btn"
          disabled={busy || !loaded}
          onClick={() => void saveAndCheck(false)}
        >
          {zh ? '保存设置' : 'Save settings'}
        </button>
        <button
          className="set-btn"
          disabled={busy || !loaded}
          onClick={() => void saveAndCheck(true)}
        >
          {busy ? (zh ? '处理中…' : 'Working…') : zh ? '保存并立即检测' : 'Save & check now'}
        </button>
      </div>
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  )
}
