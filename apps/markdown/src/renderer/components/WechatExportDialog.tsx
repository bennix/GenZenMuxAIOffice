import { useMemo, useState } from 'react'
import { copyHtmlToClipboard } from '@genoffice/ui'
import { buildWechatHtml } from '../wechat/export'
import { WECHAT_DENSITIES, WECHAT_THEMES, type WechatDensityId } from '../wechat/themes'

export function WechatExportPanel({
  editorRoot,
  onClose,
  embedded,
}: {
  editorRoot: HTMLElement
  onClose: () => void
  /** hide the dialog title when shown as a tab inside the chart studio */
  embedded?: boolean
}) {
  const chinese = navigator.language.startsWith('zh')
  const [themeId, setThemeId] = useState(WECHAT_THEMES[0]!.id)
  const [density, setDensity] = useState<WechatDensityId>('standard')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const theme = WECHAT_THEMES.find((item) => item.id === themeId) ?? WECHAT_THEMES[0]!
  const html = useMemo(
    () => buildWechatHtml(editorRoot, theme, density),
    [density, editorRoot, theme],
  )

  const copy = async () => {
    setError('')
    const ok = await copyHtmlToClipboard(html, editorRoot.innerText)
    if (!ok) {
      setError(chinese ? '复制失败，请重试' : 'Copy failed, please retry')
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      {!embedded && <h2>{chinese ? '微信公众号排版' : 'WeChat typesetting'}</h2>}
      <p className="md-mermaid-mode-hint">
        {chinese
          ? 'Mars Editor 方式：内联样式富文本，复制后粘贴到微信公众号编辑器即可还原。'
          : 'Mars Editor style: inline-styled rich text, paste into the WeChat MP editor.'}
      </p>
      <div className="md-wechat-controls">
        <label>
          {chinese ? '主题' : 'Theme'}
          <select value={themeId} onChange={(event) => setThemeId(event.target.value)}>
            {WECHAT_THEMES.map((item) => (
              <option key={item.id} value={item.id}>
                {chinese ? item.nameZh : item.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          {chinese ? '密度' : 'Density'}
          <select
            value={density}
            onChange={(event) => setDensity(event.target.value as WechatDensityId)}
          >
            {WECHAT_DENSITIES.map((item) => (
              <option key={item.id} value={item.id}>
                {chinese ? item.nameZh : item.nameEn}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="md-wechat-preview"
        style={{ background: theme.bg }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {error ? <div className="md-mermaid-error">{error}</div> : null}
      <div className="md-modal-actions">
        <button type="button" onClick={onClose}>
          {chinese ? '关闭' : 'Close'}
        </button>
        <button type="button" className="btn-primary" onClick={() => void copy()}>
          {copied
            ? chinese
              ? '已复制，去公众号粘贴'
              : 'Copied — paste in WeChat'
            : chinese
              ? '复制到公众号'
              : 'Copy for WeChat'}
        </button>
      </div>
    </>
  )
}

export function WechatExportDialog({
  editorRoot,
  onClose,
}: {
  editorRoot: HTMLElement
  onClose: () => void
}) {
  return (
    <div
      className="md-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="md-equation-dialog md-wechat-dialog">
        <WechatExportPanel editorRoot={editorRoot} onClose={onClose} />
      </div>
    </div>
  )
}
