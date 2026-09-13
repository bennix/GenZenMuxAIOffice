import { useEffect, useRef, useState } from 'react'
import {
  loadScreenwritingSkill,
  screenwritingPrompt,
  SCREENWRITING_SOURCE,
  SCREENWRITING_TASKS,
  type ScreenwritingTask,
} from './screenwriting'
import './screenwriting.css'

export function ScreenwritingStudio({
  initialSource,
  generate,
  onInsert,
  onClose,
}: {
  initialSource: string
  generate: (prompt: { system: string; user: string }) => Promise<string>
  onInsert: (text: string) => boolean
  onClose: () => void
}) {
  const [source, setSource] = useState(initialSource)
  const [instruction, setInstruction] = useState('')
  const [task, setTask] = useState<ScreenwritingTask>('sw-premise-theme')
  const [medium, setMedium] = useState('电影')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const run = async () => {
    setError('')
    setBusy(true)
    try {
      screenwritingPrompt(task, medium, instruction, source, '')
      setStatus('正在加载编剧技能…')
      const skill = await loadScreenwritingSkill(task)
      setStatus('AI 正在创作…')
      const content = (
        await generate(screenwritingPrompt(task, medium, instruction, source, skill))
      ).trim()
      if (!content) throw new Error('AI 未返回有效内容，请重试。')
      setResult(content)
      setStatus(`已生成：${SCREENWRITING_TASKS.find(([id]) => id === task)?.[1]}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="screenwriting-studio"
      aria-label="AI 编剧工作台"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header>
        <div>
          <strong>AI 编剧工作台</strong>
          <p>Screenwriting Skills · 沿用当前 AI 模型设置</p>
        </div>
        <button disabled={busy} onClick={onClose}>
          返回文档
        </button>
      </header>
      <div className="screenwriting-columns">
        <fieldset disabled={busy}>
          <label>
            创作任务
            <select value={task} onChange={(e) => setTask(e.target.value as ScreenwritingTask)}>
              {SCREENWRITING_TASKS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            目标媒介
            <select value={medium} onChange={(e) => setMedium(e.target.value)}>
              {['电影', '短片', '电视剧 / 网剧', '舞台剧'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            创作要求
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="题材、受众、时长、人物或希望改进的地方…"
            />
          </label>
          <label>
            剧本素材（从当前文档提取，可编辑）
            <textarea rows={12} value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <button disabled={!source.trim() && !instruction.trim()} onClick={() => void run()}>
            AI 生成
          </button>
          <small>
            首次使用任务时从 GitHub 加载对应 SKILL.md，需要联网。来源：{SCREENWRITING_SOURCE}
            （固定版本 560237c）。
          </small>
        </fieldset>
        <fieldset disabled={busy}>
          <label>
            AI 建议稿（可编辑）
            <textarea
              rows={22}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="生成结果显示在这里，确认后再插入文档。"
            />
          </label>
          <div className="screenwriting-actions">
            <button
              disabled={!result.trim()}
              onClick={() => {
                setSource(result)
                setStatus('已采用为素材，可继续其他创作任务。')
              }}
            >
              作为下一步素材
            </button>
            <button
              disabled={!result.trim()}
              onClick={() => {
                if (onInsert(result)) onClose()
                else setError('插入失败，请返回文档检查编辑状态。')
              }}
            >
              插入到文档末尾
            </button>
          </div>
        </fieldset>
      </div>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </dialog>
  )
}
