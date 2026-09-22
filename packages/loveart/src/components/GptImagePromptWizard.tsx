import { useMemo, useState } from 'react'
import { composeWizardPrompt, gptImageLibrary, templateFields } from '../services/gptImageWizard'
import { useSettings } from '../store/settingsStore'
import './GptImagePromptWizard.css'
import PromptResearchPanel from './PromptResearchPanel'
import type { ResearchSource } from '../services/promptResearch'
import { mergeResearchSources, withResearchSources } from '../services/researchPrompt'

export default function GptImagePromptWizard({
  initialBrief,
  onApply,
  busy,
}: {
  initialBrief: string
  onApply: (prompt: string, model: string) => void
  busy: boolean
}) {
  const [category, setCategory] = useState(gptImageLibrary.categories[0].id)
  const [search, setSearch] = useState('')
  const [templateId, setTemplateId] = useState(gptImageLibrary.templates[0].id)
  const [step, setStep] = useState(1)
  const [brief, setBrief] = useState(initialBrief)
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [constraints, setConstraints] = useState('')
  const [preview, setPreview] = useState('')
  const [applied, setApplied] = useState(false)
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([])
  const [researchNotice, setResearchNotice] = useState('')
  const models = useSettings((s) =>
    s.models.filter((m) => m.category === 'image' && m.id.startsWith('openai/gpt-image-2')),
  )
  const [model, setModel] = useState(
    () =>
      models.find((m) => m.isDefault)?.id ??
      models.find((m) => m.id === 'openai/gpt-image-2')?.id ??
      models[0]?.id ??
      '',
  )
  const template = gptImageLibrary.templates.find((item) => item.id === templateId)!
  const fields = useMemo(() => templateFields(template), [template])
  const filtered = gptImageLibrary.templates.filter((item) =>
    search.trim()
      ? `${item.title} ${item.prompt}`.toLowerCase().includes(search.trim().toLowerCase())
      : item.categoryId === category,
  )
  const applySources = (sources: ResearchSource[]) => {
    const merged = mergeResearchSources(researchSources, sources)
    setResearchSources(merged)
    setResearchNotice(
      `已将 ${merged.length} 条资料加入提示词草稿，新增内容如下。确认后点击“应用到主页”。`,
    )
    setPreview(composeWizardPrompt(template, brief, values[templateId] ?? {}, constraints))
    setApplied(false)
    setStep(3)
  }
  const researchBlock = researchSources.length > 0 && (
    <section className="wizard-applied-sources" aria-label="已应用的联网资料">
      <strong>✓ 提示词新增内容 · {researchSources.length} 条联网资料</strong>
      <p className="muted">以下内容将与提示词一起提交。可修改采用内容或移除来源。</p>
      {researchSources.map((source) => (
        <article key={source.url}>
          <div className="wizard-actions">
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title} ↗
            </a>
            <button
              aria-label={`移除资料 ${source.title}`}
              onClick={() => {
                setResearchSources((current) => current.filter((item) => item.url !== source.url))
                setApplied(false)
                setResearchNotice('已从提示词草稿移除该资料。')
              }}
            >
              移除
            </button>
          </div>
          <label>
            采用内容 · {source.title}
            <textarea
              value={source.summary}
              onChange={(event) => {
                const value = event.target.value
                setResearchSources((current) =>
                  current.map((item) =>
                    item.url === source.url ? { ...item, summary: value } : item,
                  ),
                )
                setApplied(false)
              }}
            />
          </label>
          <small className="muted">{source.provider}</small>
        </article>
      ))}
    </section>
  )
  return (
    <section className="image-wizard" aria-label="GPT-Image 2 提示词向导">
      <div className="wizard-heading">
        <div>
          <strong>GPT-Image 2 提示词向导</strong>
          <p className="muted">13 个分类 · 33 套填空模板 · 应用前可编辑</p>
        </div>
        <span className="wizard-badge">{step} / 3</span>
      </div>
      <nav className="wizard-steps" aria-label="向导步骤">
        <span aria-current={step === 1 ? 'step' : undefined}>1 选择模板</span>
        <span aria-current={step === 2 ? 'step' : undefined}>2 填写需求</span>
        <span aria-current={step === 3 ? 'step' : undefined}>3 预览应用</span>
      </nav>
      {step === 1 && (
        <>
          <input
            aria-label="搜索提示词模板"
            placeholder="搜索模板，例如海报、商品、角色…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="wizard-categories" aria-label="提示词分类">
            {gptImageLibrary.categories.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={!search && category === item.id}
                onClick={() => {
                  setCategory(item.id)
                  setSearch('')
                  setTemplateId(
                    gptImageLibrary.templates.find((template) => template.categoryId === item.id)!
                      .id,
                  )
                }}
              >
                {item.title.zh}
              </button>
            ))}
          </div>
          <div className="wizard-template-list">
            {filtered.map((item) => (
              <button
                className="wizard-template"
                key={item.id}
                aria-pressed={templateId === item.id}
                onClick={() => {
                  setTemplateId(item.id)
                  setApplied(false)
                }}
              >
                <strong>{item.title}</strong>
                <span>
                  {
                    gptImageLibrary.categories.find((cat) => cat.id === item.categoryId)
                      ?.description.zh
                  }
                </span>
              </button>
            ))}
          </div>
          {!filtered.length && <p role="status">没有匹配模板，请换个关键词。</p>}
          <div className="wizard-actions">
            <span className="muted">已选：{template.title}</span>
            <button
              className="btn-accent"
              disabled={busy || !filtered.length}
              onClick={() => setStep(2)}
            >
              填写需求 →
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <strong>{template.title}</strong>
          <label>
            主体与用途（必填）
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="例如：为我的咖啡店设计秋季新品海报"
            />
          </label>
          <details>
            <summary>细化模板参数（{fields.length} 项，可选）</summary>
            <div className="wizard-fields">
              {fields.map((field, index) => (
                <label key={field.key}>
                  {index + 1}. {field.label}
                  <input
                    value={values[templateId]?.[field.key] ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [templateId]: { ...current[templateId], [field.key]: event.target.value },
                      }))
                    }
                    placeholder="留空则按需求安排"
                  />
                </label>
              ))}
            </div>
          </details>
          <label>
            指定文案、参考图用途与保留内容
            <textarea
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              placeholder="例如：标题必须是“秋日特调”；参考图 1 保留杯子造型"
            />
          </label>
          <PromptResearchPanel
            brief={brief}
            template={template.title}
            fields={fields}
            values={values[templateId] ?? {}}
            constraints={constraints}
            appliedUrls={researchSources.map((source) => source.url)}
            onApplySources={applySources}
            onSource={(source) => applySources([source])}
            onAccept={(suggestion, sources) => {
              if (suggestion.fieldKey === '_idea')
                setConstraints((current) => `${current}\n设计补充：${suggestion.value}`.trim())
              else
                setValues((current) =>
                  current[templateId]?.[suggestion.fieldKey]?.trim()
                    ? current
                    : {
                        ...current,
                        [templateId]: {
                          ...current[templateId],
                          [suggestion.fieldKey]: suggestion.value,
                        },
                      },
                )
              if (sources.length)
                setConstraints((current) =>
                  `${current}\n资料依据（不印在画面中）：${sources.map((source) => `${source.title} ${source.url}`).join('；')}`.trim(),
                )
            }}
          />
          {researchBlock}
          <ul className="muted">
            {template.guidance.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <details>
            <summary>查看原始模板</summary>
            <pre>{template.prompt}</pre>
          </details>
          <div className="wizard-actions">
            <button onClick={() => setStep(1)}>← 模板</button>
            <button
              className="btn-accent"
              disabled={!brief.trim() || busy}
              onClick={() => {
                setPreview(
                  composeWizardPrompt(template, brief, values[templateId] ?? {}, constraints),
                )
                setStep(3)
                setApplied(false)
              }}
            >
              预览提示词 →
            </button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          {researchNotice && (
            <p role="status" className="wizard-research-notice">
              {researchNotice}
            </p>
          )}
          <label>
            生成模型
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            提示词预览（可编辑）
            <textarea
              className="wizard-preview"
              value={preview}
              onChange={(event) => {
                setPreview(event.target.value)
                setApplied(false)
              }}
            />
          </label>
          {researchBlock}
          {!!researchSources.length && (
            <details>
              <summary>查看完整提交提示词（含联网资料）</summary>
              <pre>{withResearchSources(preview, researchSources)}</pre>
            </details>
          )}
          <p className="muted">
            应用会替换主页输入框，并使用上方选择的模型。参考图和 Sketch 请在主页添加。
          </p>
          <div className="wizard-actions">
            <button onClick={() => setStep(2)}>← 修改需求</button>
            <button
              className="btn-accent"
              disabled={
                busy || !preview.trim() || !model || !models.some((item) => item.id === model)
              }
              onClick={() => {
                onApply(withResearchSources(preview, researchSources), model)
                setApplied(true)
                setResearchNotice('')
              }}
            >
              应用到主页
            </button>
          </div>
          {applied && <p role="status">已填入主页输入框，可继续编辑或点击生成。</p>}
        </>
      )}
      <footer>
        <a href={template.source} target="_blank" rel="noreferrer">
          原始模板 ↗
        </a>
        <a href="/licenses/awesome-gpt-image-2.txt" target="_blank" rel="noreferrer">
          freestylefly · MIT
        </a>
        {template.examples.map((id) => (
          <a
            key={id}
            href={`https://github.com/freestylefly/awesome-gpt-image-2/blob/${gptImageLibrary.commit}/docs/gallery-part-${id <= 165 ? 1 : 2}.md#case-${id}`}
            target="_blank"
            rel="noreferrer"
          >
            案例 #{id}
          </a>
        ))}
      </footer>
    </section>
  )
}
