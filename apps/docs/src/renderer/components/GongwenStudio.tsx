import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { GongwenFormat } from '@genoffice/gongwen'
import {
  gongwenAiPrompt,
  cleanGongwenAiDraft,
  GONGWEN_AI_LABELS,
  type GongwenAiAction,
} from '../ai/gongwen-ai'
import { useModalKeys } from './modal-keys'
import './office-studios.css'

const FORMATS: Array<[GongwenFormat, string]> = [
  ['ordinary', '普通材料'],
  ['formal', '正式发文'],
  ['letter', '信函'],
  ['command', '命令（令）'],
  ['minutes', '纪要'],
]

export function GongwenStudio({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [options, setOptions] = useState<Record<string, string>>({
    format: 'ordinary',
    letterhead: 'preprinted',
    'letterhead-reserve-mm': '72',
  })
  const [markdown, setMarkdown] = useState(() => editor.getText({ blockSeparator: '\n\n' }))
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiAction, setAiAction] = useState<GongwenAiAction | null>(null)
  const [aiResult, setAiResult] = useState<{ action: GongwenAiAction; content: string } | null>(
    null,
  )
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ path?: string; warnings?: string[] } | null>(null)
  const keys = useModalKeys(() => {
    if (!busy) onClose()
  })
  const field = (key: string, value: string) => {
    setOptions((old) => ({ ...old, [key]: value }))
    setAiResult(null)
    setResult(null)
  }
  const input = (key: string, label: string, placeholder = '') => (
    <label>
      {label}
      <input
        value={options[key] || ''}
        placeholder={placeholder}
        onChange={(e) => field(key, e.target.value)}
      />
    </label>
  )
  const runAi = async (action: GongwenAiAction) => {
    setBusy(true)
    setAiAction(action)
    setError('')
    setAiResult(null)
    try {
      const prompt = gongwenAiPrompt(action, instruction, markdown, options)
      const settings = await window.desktop.getAiSettings()
      const response = await window.desktop.aiChat({ settings, ...prompt })
      if (!response.ok || !response.content) throw new Error(response.error || 'AI 未返回正文。')
      setAiResult({ action, content: cleanGongwenAiDraft(response.content) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      setAiAction(null)
    }
  }
  const generate = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await window.desktop.generateGongwen({ markdown, options })
      if (response.error) throw new Error(response.error)
      if (!response.canceled) setResult(response)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop office-studio-backdrop" {...keys}>
      <section
        className="office-studio"
        role="dialog"
        aria-modal="true"
        aria-label="公文排版 GB/T 9704"
      >
        <header>
          <div>
            <strong>公文排版</strong>
            <span>GB/T 9704-2012 · 从当前文档提取文字，生成独立的公文 DOCX</span>
          </div>
          <button disabled={busy} onClick={onClose}>
            返回文档
          </button>
        </header>
        <div className="gongwen-layout">
          <fieldset
            className="gongwen-fields"
            disabled={busy}
            style={{ border: 0, margin: 0, minWidth: 0 }}
          >
            <section className="gongwen-ai" aria-label="公文 AI 助手">
              <strong>公文 AI 助手</strong>
              <p>沿用 Office 的 ZenMux 模型设置，结合已填字段和正文起草、润色或检查。</p>
              <label>
                写作要求
                <textarea
                  rows={3}
                  value={instruction}
                  placeholder="例如：根据下方材料起草一份工作报告，保留数据，突出下一步安排。"
                  onChange={(e) => {
                    setInstruction(e.target.value)
                    setAiResult(null)
                  }}
                />
              </label>
              <div className="gongwen-ai-actions">
                {(['draft', 'polish', 'review'] as const).map((action) => (
                  <button
                    key={action}
                    disabled={
                      action === 'draft'
                        ? !instruction.trim() && !markdown.trim()
                        : !markdown.trim()
                    }
                    onClick={() => void runAi(action)}
                  >
                    {GONGWEN_AI_LABELS[action]}
                  </button>
                ))}
              </div>
              {aiAction && <p role="status">{GONGWEN_AI_LABELS[aiAction]}中…</p>}
              {aiResult && (
                <div className="gongwen-ai-result">
                  <strong>{aiResult.action === 'review' ? '检查建议' : 'AI 建议稿'}</strong>
                  <textarea
                    aria-label={aiResult.action === 'review' ? 'AI 检查建议' : 'AI 建议稿'}
                    rows={7}
                    readOnly
                    value={aiResult.content}
                  />
                  <div className="gongwen-ai-actions">
                    {aiResult.action !== 'review' && (
                      <button
                        onClick={() => {
                          setMarkdown(aiResult.content)
                          setResult(null)
                          setAiResult(null)
                        }}
                      >
                        采用到正文
                      </button>
                    )}
                    <button onClick={() => setAiResult(null)}>关闭建议</button>
                  </div>
                </div>
              )}
            </section>
            <div className="gongwen-pair">
              <label>
                版式
                <select
                  value={options.format}
                  onChange={(e) => {
                    field('format', e.target.value)
                    field('page-number', '')
                  }}
                >
                  {FORMATS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                页码
                <select
                  value={options['page-number'] || ''}
                  onChange={(e) => field('page-number', e.target.value)}
                >
                  <option value="">随版式自动选择</option>
                  <option value="center">居中</option>
                  <option value="standard">单页右 · 双页左</option>
                  <option value="none">无页码</option>
                </select>
              </label>
            </div>
            {options.format === 'formal' && (
              <div className="gongwen-pair">
                <label>
                  红头方式
                  <select
                    value={options.letterhead}
                    onChange={(e) => field('letterhead', e.target.value)}
                  >
                    <option value="preprinted">预印红头纸套打</option>
                    <option value="digital">完整电子红头</option>
                  </select>
                </label>
                {options.letterhead === 'preprinted' &&
                  input('letterhead-reserve-mm', '预留高度（37–130 mm）')}
              </div>
            )}
            {input('title', '公文标题', '也可从正文首个 Markdown 标题自动识别')}
            <div className="gongwen-pair">
              {input('org', options.format === 'minutes' ? '纪要名称（以“纪要”结尾）' : '发文机关')}
              {input(
                'doc-no',
                options.format === 'command' ? '令号' : '发文字号',
                options.format === 'command' ? '第1号' : '单位发〔2026〕1号',
              )}
            </div>
            {input('to', '主送机关')}
            <div className="gongwen-pair">
              {input('sender', '署名')}
              {input('date', '成文日期', '2026年9月11日')}
            </div>
            <details>
              <summary>签发人、附件说明与版记</summary>
              <div className="gongwen-pair">
                {input('signer', '签发人')}
                {input('signer-title', '签发人职务')}
              </div>
              <label>
                行文方向
                <select
                  value={options.upward || 'false'}
                  onChange={(e) => field('upward', e.target.value)}
                >
                  <option value="false">一般行文</option>
                  <option value="true">上行文（文号与签发人同一行）</option>
                </select>
              </label>
              {input('attachment-note', '附件说明')}
              {input('cc', '抄送机关')}
              <div className="gongwen-pair">
                {input('print-org', '印发机关')}
                {input('print-date', '印发日期', '2026年9月11日')}
              </div>
              {options.format === 'minutes' && (
                <>
                  {input('attendees', '出席')}
                  {input('absent', '请假')}
                  {input('observers', '列席')}
                </>
              )}
            </details>
            <label>
              正文（可编辑 Markdown；图片不会转换为正文）
              <textarea
                rows={12}
                value={markdown}
                onChange={(e) => {
                  setMarkdown(e.target.value)
                  setAiResult(null)
                  setResult(null)
                }}
              />
            </label>
          </fieldset>
          <aside className="gongwen-preview">
            <div className="gongwen-paper">
              {options.format === 'formal' && options.letterhead === 'preprinted' ? (
                <div className="gongwen-reserve">
                  预印红头区域 · {options['letterhead-reserve-mm']} mm
                </div>
              ) : (
                options.format !== 'ordinary' && (
                  <div className="gongwen-letterhead">{options.org || '发文机关'}</div>
                )
              )}
              {options['doc-no'] && (
                <p style={{ textAlign: 'center', textIndent: 0 }}>{options['doc-no']}</p>
              )}
              <h3>{options.title || '公文标题'}</h3>
              <p>{options.to}</p>
              <p>{markdown.slice(0, 480) || '正文采用三号仿宋、两字缩进，按标题层级组织内容。'}</p>
            </div>
            <p>
              版式示意，实际分页以生成的 Word 文档为准。A4 · 156 × 225 mm 版心 · 三号仿宋 ·
              二号小标宋标题。
            </p>
            <p>普通材料默认不使用红头；字体缺失时会在生成结果中提示实际替代字体。</p>
          </aside>
        </div>
        {error && <div role="alert">{error}</div>}
        {result && (
          <div role="status" style={{ padding: '10px 20px' }}>
            已保存：{result.path}
            {result.warnings?.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <footer>
          <span>
            {busy
              ? aiAction
                ? `${GONGWEN_AI_LABELS[aiAction]}中…`
                : '正在生成 DOCX…'
              : '采用 AI 建议后，可继续编辑正文并生成 DOCX'}
          </span>
          {result?.path && (
            <button onClick={() => void window.desktop.openNewTab(result.path)}>
              在 Word 中打开
            </button>
          )}
          <button disabled={busy || !markdown.trim()} onClick={() => void generate()}>
            生成并另存 DOCX
          </button>
        </footer>
      </section>
    </div>
  )
}
