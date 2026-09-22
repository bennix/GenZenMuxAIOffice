import SketchPad from './SketchPad'
import {
  normalizeVideoOptions,
  videoCapabilities,
  type VideoSettings,
  type VideoMode,
} from '../services/videoModels'
import VideoDurationSelect from './VideoDurationSelect'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import ModelPicker from './ModelPicker'
import StylePicker from './StylePicker'
import ReferenceTray, { makeRef } from './ReferenceTray'
import type { Ref } from './ReferenceTray'
import OpenDesignControls from './OpenDesignControls'
import HumanScenePicker from './HumanScenePicker'
import {
  applyOpenDesignTemplate,
  extractOpenDesignBrief,
  listOpenDesignSystems,
  listOpenDesignTemplates,
  openDesignSystemById,
  openDesignTemplateById,
} from '../services/openDesign'
import type { Aspect } from '../services/styleTemplates'
import {
  applyYouMindTemplate,
  extractYouMindBrief,
  listYouMindTemplates,
  youMindCategoryById,
  youMindTemplateById,
} from '../services/youmind'
import { createDefaultHumanScene, normalizeHumanScene } from '../services/humanScene'
import { useT } from '../i18n'
import { useSettings } from '../store/settingsStore'
import type { HumanScene } from '../types'
import { applyPhotoEnhancement, photoEnhancements } from '../data/photoEnhancements'

export type Mode = 'image' | 'video'
const ASPECTS: Aspect[] = ['16:9', '9:16', '1:1']
const GptImagePromptWizard = lazy(() => import('./GptImagePromptWizard'))

export interface Composed extends VideoSettings {
  videoAspect?: string
  sketchReferenceIndices?: number[]
  text: string
  mode: Mode
  aspect: Aspect
  duration: number
  styleSlug: string | null
  refBlobs: Blob[]
  openDesignSystemId: string | null
  openDesignTemplateId: string | null
  youMindCategoryId: string | null
  youMindTemplateId: string | null
  humanSceneId: string | null
  humanSceneDraft: HumanScene | null
  useHumanSceneReference: boolean
}

// Shared prompt controls used by both the Home hero and the workspace prompt bar:
// Image/Video mode + its model picker, style (image only), aspect (both), reference
// upload/paste, and the text input + submit. Owns mode/style/aspect/refs; text is
// controlled so callers (e.g. Home chips) can prefill it.
export default function PromptComposer({
  projectId,
  text,
  onText,
  apiKey,
  busy,
  placeholder,
  submitLabel = '↑',
  onSubmit,
  showImageWizard = false,
}: {
  projectId?: string
  text: string
  onText: (v: string) => void
  apiKey: string
  busy: boolean
  placeholder: string
  submitLabel?: string
  onSubmit: (c: Composed) => void
  showImageWizard?: boolean
}) {
  const t = useT()
  const lang = useSettings((state) => state.lang)
  const [mode, setMode] = useState<Mode>('image')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [styleSlug, setStyleSlug] = useState<string | null>(null)
  const [aspect, setAspect] = useState<Aspect>('16:9')
  const [duration, setDuration] = useState<number>(8)
  const models = useSettings((s) => s.models)
  const imageModel =
    models.find((m) => m.category === 'image' && m.isDefault)?.id ??
    models.find((m) => m.category === 'image')?.id
  const videoModel =
    models.find((m) => m.category === 'video' && m.isDefault)?.id ??
    models.find((m) => m.category === 'video')?.id ??
    ''
  const [videoAspect, setVideoAspect] = useState('16:9')
  const [resolution, setResolution] = useState<string>()
  const [generateAudio, setGenerateAudio] = useState(true)
  const [videoMode, setVideoMode] = useState<VideoMode>('firstLastFrame')
  const [refs, setRefs] = useState<Ref[]>([])
  const [sketchOpen, setSketchOpen] = useState(false)
  const caps = videoCapabilities(videoModel, videoMode, refs.length)
  const videoOptions = normalizeVideoOptions(
    videoModel,
    { aspect: videoAspect, duration, resolution, generateAudio, videoMode },
    refs.length,
  )
  useEffect(() => {
    if (!caps.modes.includes(videoMode)) setVideoMode(caps.modes[0])
  }, [videoModel, videoMode])
  const maxVideoRefs =
    videoMode === 'firstLastFrame' ? (caps.supportsLastFrame ? 2 : 1) : caps.maxReferences
  const tooManyRefs = mode === 'video' && refs.length > maxVideoRefs
  const refsRef = useRef<Ref[]>([])
  const [openDesignSystemId, setOpenDesignSystemId] = useState<string | null>(null)
  const [openDesignTemplateId, setOpenDesignTemplateId] = useState<string | null>(null)
  const [youMindCategoryId, setYouMindCategoryId] = useState<string | null>(null)
  const [youMindTemplateId, setYouMindTemplateId] = useState<string | null>(null)
  const [humanSceneId, setHumanSceneId] = useState<string | null>(null)
  const [useHumanSceneReference, setUseHumanSceneReference] = useState(false)
  const [draftHumanScenes, setDraftHumanScenes] = useState<HumanScene[]>([])
  const selectedPhotoEnhancement = photoEnhancements.find(
    (preset) => text.includes(preset.zh.prompt) || text.includes(preset.en.prompt),
  )

  useEffect(() => {
    refsRef.current = refs
  }, [refs])

  useEffect(
    () => () => {
      refsRef.current.forEach((r) => URL.revokeObjectURL(r.url))
      refsRef.current = []
    },
    [],
  )

  const addRefs = (blobs: Blob[]) => setRefs((r) => [...r, ...blobs.map(makeRef)])
  const removeRef = (id: string) =>
    setRefs((r) => {
      const removed = r.find((x) => x.id === id)
      if (removed) URL.revokeObjectURL(removed.url)
      const next = r.filter((x) => x.id !== id)
      refsRef.current = next
      return next
    })
  const clearOpenDesignSelection = () => {
    setOpenDesignSystemId(null)
    setOpenDesignTemplateId(null)
  }
  const clearYouMindSelection = () => {
    setYouMindCategoryId(null)
    setYouMindTemplateId(null)
  }
  const clearHumanSceneSelection = () => {
    setHumanSceneId(null)
    setUseHumanSceneReference(false)
  }
  const draftHumanScene =
    !projectId && humanSceneId
      ? (draftHumanScenes.find((scene) => scene.id === humanSceneId) ?? null)
      : null
  const createDraftHumanScene = (): HumanScene => {
    const now = Date.now()
    const scene = normalizeHumanScene({
      ...createDefaultHumanScene('', `Human Scene ${draftHumanScenes.length + 1}`, aspect),
      id: `draft-human-scene-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: now,
      updatedAt: now,
    })
    setDraftHumanScenes((current) => [...current, scene])
    return scene
  }
  const updateDraftHumanScene = (scene: HumanScene) => {
    setDraftHumanScenes((current) =>
      current.map((item) =>
        item.id === scene.id ? normalizeHumanScene({ ...scene, updatedAt: Date.now() }) : item,
      ),
    )
  }

  useEffect(() => {
    clearHumanSceneSelection()
  }, [projectId])

  const currentBrief = () => extractYouMindBrief(text) ?? extractOpenDesignBrief(text) ?? text
  const templateMatchesSystem = (templateText: string, systemId: string): boolean => {
    const system = listOpenDesignSystems(lang).find((item) => item.id === systemId)
    if (!system) return false
    const needles = [system.id, system.name, system.category]
      .map((value) => value.toLowerCase())
      .filter(Boolean)
    return needles.some((needle) => templateText.includes(needle))
  }
  const firstOpenDesignTemplateForSystem = (systemId: string | null) => {
    const templates = listOpenDesignTemplates(mode, lang)
    if (!systemId) return null
    return (
      templates.find((template) => {
        const text = [
          template.id,
          template.title,
          template.summary,
          template.category,
          template.tags.join(' '),
          template.prompt,
        ]
          .join(' ')
          .toLowerCase()
        return templateMatchesSystem(text, systemId)
      }) ??
      templates[0] ??
      null
    )
  }
  const firstOpenDesignSystemForTemplate = (templateId: string | null) => {
    const template = openDesignTemplateById(templateId, lang)
    if (!template) return null
    const text = [
      template.id,
      template.title,
      template.summary,
      template.category,
      template.tags.join(' '),
      template.prompt,
    ]
      .join(' ')
      .toLowerCase()
    return (
      listOpenDesignSystems(lang).find((system) => templateMatchesSystem(text, system.id)) ??
      listOpenDesignSystems(lang)[0] ??
      null
    )
  }
  const applyVisibleOpenDesignPrompt = (nextTemplateId: string, nextSystemId?: string | null) => {
    const template = openDesignTemplateById(nextTemplateId, lang)
    if (!template) return
    const systemId = nextSystemId ?? firstOpenDesignSystemForTemplate(nextTemplateId)?.id ?? null
    const system = openDesignSystemById(systemId, lang)
    clearYouMindSelection()
    setOpenDesignSystemId(systemId)
    setOpenDesignTemplateId(template.id)
    onText(
      applyOpenDesignTemplate(template, {
        brief: currentBrief(),
        aspect,
        designSystem: system,
        locale: lang,
      }),
    )
  }
  const selectOpenDesignSystem = (nextSystemId: string | null) => {
    setOpenDesignSystemId(nextSystemId)
    if (!nextSystemId) {
      setOpenDesignTemplateId(null)
      return
    }
    clearYouMindSelection()
    const template = firstOpenDesignTemplateForSystem(nextSystemId)
    if (template) {
      applyVisibleOpenDesignPrompt(template.id, nextSystemId)
      return
    }
    setOpenDesignTemplateId(null)
  }
  const selectOpenDesignTemplate = (nextTemplateId: string | null) => {
    setOpenDesignTemplateId(nextTemplateId)
    if (!nextTemplateId) return
    const system = firstOpenDesignSystemForTemplate(nextTemplateId)
    applyVisibleOpenDesignPrompt(nextTemplateId, system?.id ?? null)
  }
  const applyVisibleYouMindPrompt = (nextTemplateId: string, nextCategoryId?: string | null) => {
    const template = youMindTemplateById(nextTemplateId, lang)
    if (!template) return
    const categoryId = nextCategoryId ?? template.categoryId
    const category = youMindCategoryById(categoryId, lang)
    setMode('image')
    setStyleSlug(null)
    clearHumanSceneSelection()
    clearOpenDesignSelection()
    setYouMindCategoryId(categoryId)
    setYouMindTemplateId(template.id)
    onText(
      applyYouMindTemplate(template, {
        brief: extractYouMindBrief(text) ?? text,
        aspect,
        locale: lang,
        category,
      }),
    )
  }
  const selectYouMindTemplate = (nextTemplateId: string | null) => {
    if (!nextTemplateId) {
      setYouMindTemplateId(null)
      return
    }
    applyVisibleYouMindPrompt(nextTemplateId)
  }
  const selectYouMindCategory = (nextCategoryId: string | null) => {
    setYouMindCategoryId(nextCategoryId)
    if (!nextCategoryId) {
      setYouMindTemplateId(null)
      return
    }
    const template = listYouMindTemplates(lang).find((item) => item.categoryId === nextCategoryId)
    if (template) applyVisibleYouMindPrompt(template.id, nextCategoryId)
  }
  const selectMode = (nextMode: Mode) => {
    if (mode === nextMode) return
    setMode(nextMode)
    setOpenDesignTemplateId(null)
    if (nextMode === 'image') clearHumanSceneSelection()
    if (openDesignSystemId) {
      const nextTemplates = listOpenDesignTemplates(nextMode, lang)
      const matchedTemplate = nextTemplates.find((template) => {
        const templateText = [
          template.id,
          template.title,
          template.summary,
          template.category,
          template.tags.join(' '),
          template.prompt,
        ]
          .join(' ')
          .toLowerCase()
        return templateMatchesSystem(templateText, openDesignSystemId)
      })
      const nextTemplate = matchedTemplate ?? nextTemplates[0] ?? null
      if (nextTemplate) {
        const system = openDesignSystemById(openDesignSystemId, lang)
        setOpenDesignTemplateId(nextTemplate.id)
        onText(
          applyOpenDesignTemplate(nextTemplate, {
            brief: currentBrief(),
            aspect,
            designSystem: system,
            locale: lang,
          }),
        )
      } else {
        setOpenDesignTemplateId(null)
      }
    }
    if (nextMode === 'video') selectYouMindTemplate(null)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.items)
      .filter((it) => it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f)
    if (imgs.length) {
      e.preventDefault()
      addRefs(imgs)
    }
  }

  const submit = () => {
    if (!text.trim() || !apiKey || busy || tooManyRefs) return
    onSubmit({
      text,
      mode,
      aspect,
      duration: mode === 'video' ? videoOptions.duration : duration,
      ...(mode === 'video'
        ? {
            model: videoModel,
            videoAspect: videoOptions.aspect,
            resolution: videoOptions.resolution,
            generateAudio: videoOptions.generateAudio,
            videoMode,
          }
        : { model: imageModel }),
      styleSlug,
      refBlobs: refs.map((r) => r.blob),
      ...(refs.some((r) => r.kind === 'sketch')
        ? { sketchReferenceIndices: refs.flatMap((r, i) => (r.kind === 'sketch' ? [i] : [])) }
        : {}),
      openDesignSystemId,
      openDesignTemplateId,
      youMindCategoryId,
      youMindTemplateId,
      humanSceneId: mode === 'video' ? humanSceneId : null,
      humanSceneDraft: mode === 'video' ? draftHumanScene : null,
      useHumanSceneReference: mode === 'video' ? useHumanSceneReference : false,
    })
    refs.forEach((r) => URL.revokeObjectURL(r.url))
    refsRef.current = []
    onText('')
    setRefs([])
    setOpenDesignTemplateId(null)
    setYouMindTemplateId(null)
    if (mode === 'image') clearHumanSceneSelection()
  }

  const seg = (on: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 12,
    cursor: 'pointer',
    background: on ? 'var(--accent-grad)' : 'var(--bg-elevated)',
    color: on ? '#fff' : 'var(--text-primary)',
    border: '1px solid var(--border)',
  })

  return (
    <div>
      {/* Mode: Image OR Video, with its model picker */}
      <div
        style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={seg(mode === 'image')} onClick={() => selectMode('image')}>
            {t('modeImage')}
          </button>
          <button style={seg(mode === 'video')} onClick={() => selectMode('video')}>
            {t('modeVideo')}
          </button>
        </div>
        <ModelPicker category={mode} />
      </div>

      {showImageWizard && mode === 'image' && (
        <>
          <button
            type="button"
            className="chip"
            aria-expanded={wizardOpen}
            disabled={busy}
            onClick={() => setWizardOpen((open) => !open)}
          >
            ✦ GPT-Image 2 提示词向导 {wizardOpen ? '收起' : '· 选择模板'}
          </button>
          {wizardOpen && (
            <Suspense fallback={<p role="status">正在加载提示词模板…</p>}>
              <GptImagePromptWizard
                initialBrief={text}
                busy={busy}
                onApply={(prompt, model) => {
                  useSettings.getState().setDefault(model)
                  setStyleSlug(null)
                  setOpenDesignSystemId(null)
                  setOpenDesignTemplateId(null)
                  setYouMindCategoryId(null)
                  setYouMindTemplateId(null)
                  onText(prompt)
                }}
              />
            </Suspense>
          )}
        </>
      )}

      <OpenDesignControls
        mode={mode}
        systemId={openDesignSystemId}
        templateId={openDesignTemplateId}
        youMindCategoryId={youMindCategoryId}
        youMindTemplateId={youMindTemplateId}
        onMode={selectMode}
        onSystem={selectOpenDesignSystem}
        onTemplate={selectOpenDesignTemplate}
        onYouMindCategory={selectYouMindCategory}
        onYouMindTemplate={selectYouMindTemplate}
      />

      {mode === 'image' && (
        <div style={{ marginBottom: 8 }}>
          <StylePicker
            slug={styleSlug}
            onStyle={setStyleSlug}
            youMindTemplateId={youMindTemplateId}
            onYouMindTemplate={selectYouMindTemplate}
            onYouMindCategory={selectYouMindCategory}
            aspect={aspect}
            promptText={text}
            onPromptText={onText}
          />
        </div>
      )}

      {mode === 'image' && (
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 13,
            }}
          >
            {t('photoEnhance')}
            <select
              aria-label={t('photoEnhance')}
              value={selectedPhotoEnhancement?.id ?? ''}
              disabled={busy}
              style={{ flex: '1 1 180px', maxWidth: 360 }}
              onChange={(event) => {
                const preset = photoEnhancements.find((item) => item.id === event.target.value)
                if (preset) {
                  setStyleSlug(null)
                  clearOpenDesignSelection()
                  clearYouMindSelection()
                }
                onText(applyPhotoEnhancement(text, preset, lang))
              }}
            >
              <option value="">{t('styleNone')}</option>
              {photoEnhancements.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset[lang].name}
                </option>
              ))}
            </select>
          </label>
          {selectedPhotoEnhancement && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.6 }}>
              {selectedPhotoEnhancement[lang].goal} · {t('photoComposerHint')}
            </p>
          )}
        </div>
      )}

      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, alignItems: 'center' }}
      >
        <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>
          {t('aspect')}
        </span>
        {(mode === 'video' ? caps.ratios : ASPECTS).map((a) => (
          <button
            key={a}
            style={seg((mode === 'video' ? videoOptions.aspect : aspect) === a)}
            onClick={() => (mode === 'video' ? setVideoAspect(a) : setAspect(a as Aspect))}
          >
            {a === 'adaptive'
              ? caps.followsFirstFrame
                ? lang === 'zh'
                  ? '跟随首帧'
                  : 'Follow first frame'
                : lang === 'zh'
                  ? '智能'
                  : 'Auto'
              : a}
          </button>
        ))}
      </div>

      {mode === 'video' && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            marginBottom: 8,
            alignItems: 'center',
          }}
        >
          <VideoDurationSelect
            durations={caps.durations}
            value={videoOptions.duration}
            onChange={setDuration}
          />
          {caps.resolutions.length > 0 && (
            <select
              aria-label={lang === 'zh' ? '视频分辨率' : 'Video resolution'}
              value={videoOptions.resolution}
              onChange={(e) => setResolution(e.target.value)}
            >
              {caps.resolutions.map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
          )}
          {caps.supportsAudio && (
            <label>
              <input
                type="checkbox"
                checked={generateAudio}
                onChange={(e) => setGenerateAudio(e.target.checked)}
              />
              {lang === 'zh' ? '声音' : 'Audio'}
            </label>
          )}
          <select
            aria-label={lang === 'zh' ? '视频生成模式' : 'Video mode'}
            value={videoMode}
            onChange={(e) => setVideoMode(e.target.value as VideoMode)}
          >
            {caps.modes.map((m) => (
              <option key={m} value={m}>
                {m === 'firstLastFrame'
                  ? lang === 'zh'
                    ? '首尾帧'
                    : 'First / last frame'
                  : lang === 'zh'
                    ? '参考图生成'
                    : 'Reference images'}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>
            {videoMode === 'firstLastFrame'
              ? lang === 'zh'
                ? caps.supportsLastFrame
                  ? '不上传为文生视频；第1张为首帧，第2张为尾帧'
                  : '不上传为文生视频；第1张为首帧'
                : caps.supportsLastFrame
                  ? 'Text only, or image 1 = first frame; image 2 = last frame'
                  : 'Text only, or image 1 = first frame'
              : lang === 'zh'
                ? `最多 ${maxVideoRefs} 张参考图`
                : `Up to ${maxVideoRefs} references`}
          </span>
          {tooManyRefs && (
            <span role="alert">
              {lang === 'zh'
                ? `请移除多余参考图，最多 ${maxVideoRefs} 张`
                : `Remove extra references (maximum ${maxVideoRefs})`}
            </span>
          )}
        </div>
      )}

      {mode === 'video' ? (
        <div style={{ marginBottom: 8 }}>
          <HumanScenePicker
            projectId={projectId}
            aspect={aspect}
            value={humanSceneId}
            useReference={useHumanSceneReference}
            scenes={projectId ? undefined : draftHumanScenes}
            onCreateScene={projectId ? undefined : createDraftHumanScene}
            onUpdateScene={projectId ? undefined : updateDraftHumanScene}
            onChange={setHumanSceneId}
            onUseReferenceChange={setUseHumanSceneReference}
          />
        </div>
      ) : null}

      <button
        className="chip"
        style={{ marginBottom: 8 }}
        onClick={() => setSketchOpen(true)}
        disabled={busy}
      >
        {lang === 'zh' ? '✎ Sketch 手绘板' : '✎ Sketch pad'}
      </button>
      <SketchPad
        open={sketchOpen}
        onClose={() => setSketchOpen(false)}
        onAdd={(blob) => setRefs((r) => [...r, { ...makeRef(blob), kind: 'sketch' }])}
      />
      <ReferenceTray refs={refs} onAdd={addRefs} onRemove={removeRef} />

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder={placeholder}
          rows={2}
          style={{ flex: 1, minHeight: 64, resize: 'none' }}
          disabled={!apiKey}
        />
        <button className="btn-accent" onClick={submit} disabled={!apiKey || busy || !text.trim()}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
