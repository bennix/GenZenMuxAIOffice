import { useState } from 'react'
import { useI18n } from '../i18n/locale'

export const BEAUTIFY_STYLES = [
  {
    id: 'business',
    zh: '清晰商务',
    en: 'Clear business',
    bg: '#F4F7FB',
    ink: '#172B4D',
    accent: '#2459B8',
    font: 'Aptos, "PingFang SC", "Microsoft YaHei", sans-serif',
    family: 'Aptos / 微软雅黑',
    tip: '突出结论，适合汇报与提案',
    tipEn: 'Lead with conclusions for reports and proposals.',
  },
  {
    id: 'editorial',
    zh: '人文简约',
    en: 'Editorial',
    bg: '#FAF6ED',
    ink: '#34352C',
    accent: '#7A472B',
    font: 'Georgia, "Songti SC", SimSun, serif',
    family: 'Georgia / 宋体',
    tip: '温暖配色，适合故事与品牌介绍',
    tipEn: 'Warm colors for stories and brand presentations.',
  },
  {
    id: 'contrast',
    zh: '深色聚焦',
    en: 'Dark focus',
    bg: '#142D2B',
    ink: '#F4F8F3',
    accent: '#ACE5C4',
    font: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
    family: 'Avenir Next / 苹方',
    tip: '高对比大字，适合演讲与成果展示',
    tipEn: 'High contrast for talks and results.',
  },
] as const

export function beautifyInstruction(
  style: (typeof BEAUTIFY_STYLES)[number],
  large: boolean,
  page: number,
) {
  const body = large ? 28 : 24
  const title = large ? 42 : 36
  return `Beautify page ${page} only. Read its complete content first and preserve all facts, names and numbers. The user selected ${style.en}: background ${style.bg}, text ${style.ink}, accent ${style.accent}, font stack ${style.font}. Apply this selected style instead of earlier style templates. Page title at least ${title}pt (${(title * 4) / 3}px), ordinary body at least ${body}pt (${(body * 4) / 3}px), labels at least 18pt (24px). These are slide sizes, not preview sizes. Keep larger existing text. Give text boxes enough space and generous line spacing; never shrink via autofit, transforms or overflow clipping. Reorganize the layout to fit; do not delete content or add pages without asking. Use regenerate_slide for a full redesign and carry these exact style and typography requirements into its brief.`
}

export function BeautifySuggestions({
  page,
  busy,
  onApply,
  onCancel,
}: {
  page: number
  busy: boolean
  onApply: (instruction: string, label: string) => void
  onCancel: () => void
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh' || lang === 'zh-TW'
  const [selected, setSelected] = useState(0)
  const [large, setLarge] = useState(false)
  const style = BEAUTIFY_STYLES[selected]!
  return (
    <section className="beautify-suggestions" aria-label={zh ? '美化建议' : 'Design suggestions'}>
      <div className="beautify-heading">
        <strong>{zh ? '选择美化方案' : 'Choose a design'}</strong>
        <button
          type="button"
          onClick={onCancel}
          aria-label={zh ? '关闭美化建议' : 'Close suggestions'}
        >
          ×
        </button>
      </div>
      <p>
        {zh
          ? `将应用到第 ${page} 页。先比较字体与配色，再开始美化。`
          : `Apply to slide ${page}. Compare fonts and colors before starting.`}
      </p>
      <div className="beautify-options">
        {BEAUTIFY_STYLES.map((s, i) => (
          <button
            type="button"
            key={s.id}
            className="beautify-option"
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <span
              className="beautify-preview"
              style={{ background: s.bg, color: s.ink, fontFamily: s.font }}
              aria-hidden="true"
            >
              <span className="beautify-preview-rule" style={{ background: s.accent }} />
              <strong>{zh ? '让重点一目了然' : 'Make the key point clear'}</strong>
              <span>{zh ? '清晰表达 · 从容留白' : 'Clear ideas. Room to breathe.'}</span>
              <span className="beautify-swatches">
                {[s.bg, s.ink, s.accent].map((c) => (
                  <i key={c} style={{ background: c, borderColor: s.ink }} />
                ))}
              </span>
            </span>
            <span className="beautify-option-label">
              <strong>{zh ? s.zh : s.en}</strong>
              <span>{selected === i ? '✓' : ''}</span>
            </span>
            <span>{zh ? s.tip : s.tipEn}</span>
            <small>{s.family}</small>
          </button>
        ))}
      </div>
      <label className="beautify-large">
        <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} />
        {zh ? '演讲大字模式' : 'Large type for presenting'}
      </label>
      <p>
        {zh
          ? `标题 ≥ ${large ? 42 : 36} pt · 正文 ≥ ${large ? 28 : 24} pt。预览为风格示意，实际内容由 AI 排版。`
          : `Title ≥ ${large ? 42 : 36} pt · Body ≥ ${large ? 28 : 24} pt. Style samples; AI will lay out your content.`}
      </p>
      <button
        type="button"
        className="beautify-apply"
        disabled={busy}
        onClick={() =>
          onApply(
            beautifyInstruction(style, large, page),
            zh
              ? `使用「${style.zh}」美化第 ${page} 页${large ? '（演讲大字）' : ''}`
              : `Apply ${style.en} to slide ${page}${large ? ' (large type)' : ''}`,
          )
        }
      >
        {zh ? '应用此方案' : 'Apply design'}
      </button>
    </section>
  )
}
