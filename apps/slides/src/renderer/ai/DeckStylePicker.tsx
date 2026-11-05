import { useState } from 'react'
import { useI18n } from '../i18n/locale'
import { designCandidates, designContract } from './design-system'

export function DeckStylePicker({
  topic,
  onChoose,
  onCancel,
}: {
  topic: string
  onChoose: (style: string) => void
  onCancel: () => void
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh' || lang === 'zh-TW'
  const candidates = designCandidates(topic)
  const [selected, setSelected] = useState(0)
  const [large, setLarge] = useState(false)
  return (
    <section
      className="beautify-suggestions"
      aria-label={zh ? '选择整套幻灯片风格' : 'Choose a deck design'}
    >
      <div className="beautify-heading">
        <strong>
          {zh ? '先看三个方向，再生成整套' : 'Preview three directions before building'}
        </strong>
      </div>
      <p>
        {zh
          ? '预览使用你的主题；确认后将统一应用配色、字体与排版规则。'
          : 'Your topic in three design samples. Your choice locks the palette, typography and layout rules.'}
      </p>
      <div className="beautify-options">
        {candidates.map((style, index) => (
          <button
            type="button"
            key={style.id}
            className="beautify-option"
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            <span
              className="beautify-preview"
              style={{
                background: style.bg,
                color: style.ink,
                fontFamily: style.font,
                textAlign: style.id === 'contrast' ? 'center' : 'left',
                borderLeft: style.id === 'editorial' ? `8px solid ${style.accent}` : undefined,
              }}
              aria-hidden="true"
            >
              <span
                className="beautify-preview-rule"
                style={{ background: style.accent, width: style.id === 'contrast' ? '25%' : '70%' }}
              />
              <strong style={{ overflowWrap: 'anywhere' }}>{topic.slice(0, 70)}</strong>
              <span>{zh ? '观点 · 证据 · 下一步' : 'Insight · Evidence · Next step'}</span>
              <span className="beautify-swatches">
                {[style.bg, style.ink, style.accent].map((color) => (
                  <i key={color} style={{ background: color, borderColor: style.ink }} />
                ))}
              </span>
            </span>
            <strong>
              {zh ? style.zh : style.en}
              {index === selected ? ' ✓' : ''}
            </strong>
          </button>
        ))}
      </div>
      <label className="beautify-large">
        <input
          type="checkbox"
          checked={large}
          onChange={(event) => setLarge(event.target.checked)}
        />
        {zh ? '演讲大字模式' : 'Large type for presenting'}
      </label>
      <p>
        {zh
          ? '这些是风格示意，不是最终页面；不会自动生成虚构数据。'
          : 'Design samples, not final slides. No fabricated data.'}
      </p>
      <button type="button" onClick={onCancel}>
        {zh ? '取消生成' : 'Cancel generation'}
      </button>
      <button
        type="button"
        className="beautify-apply"
        onClick={() => onChoose(designContract(candidates[selected]!, large))}
      >
        {zh ? '使用此风格生成' : 'Build with this design'}
      </button>
    </section>
  )
}
