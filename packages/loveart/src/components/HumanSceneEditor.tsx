import { useEffect, useMemo, useState } from 'react'
import HumanSceneInteractivePreview, {
  DEFAULT_HUMAN_SCENE_VIEWPORT,
  humanSceneViewBox,
} from './HumanSceneInteractivePreview'
import type { DragTarget, HumanSceneViewport } from './HumanSceneInteractivePreview'
import { createDefaultHumanFigure, normalizeHumanScene } from '../services/humanScene'
import {
  angleFromDown,
  clamp,
  clampAngle,
  figureGeometry,
  JOINT_LIMITS,
  pointToStagePercent,
  stageSizeForAspect,
} from '../services/humanSceneGeometry'
import type { FigureGeometry, Point } from '../services/humanSceneGeometry'
import { useT } from '../i18n'
import type { TKey } from '../i18n'
import type {
  HumanFigure,
  HumanFigureFacing,
  HumanFigureJoints,
  HumanPosePreset,
  HumanScene,
} from '../types'

const POSE_PRESETS: HumanPosePreset[] = [
  'standing',
  'sitting',
  'walking',
  'waving',
  'talking',
  'pointing',
  'turning',
]

const FACING_VALUES: HumanFigureFacing[] = ['front', 'back', 'left', 'right', 'toward-person']

type JointKey = keyof HumanFigureJoints

const JOINT_CONTROLS: Array<{
  key: JointKey
  label: TKey
  min: number
  max: number
}> = [
  { key: 'head', label: 'humanSceneHead', ...JOINT_LIMITS.head },
  { key: 'torso', label: 'humanSceneTorso', ...JOINT_LIMITS.torso },
  { key: 'leftArm', label: 'humanSceneLeftArm', ...JOINT_LIMITS.leftArm },
  { key: 'rightArm', label: 'humanSceneRightArm', ...JOINT_LIMITS.rightArm },
  { key: 'leftElbow', label: 'humanSceneLeftElbow', ...JOINT_LIMITS.leftElbow },
  { key: 'rightElbow', label: 'humanSceneRightElbow', ...JOINT_LIMITS.rightElbow },
  { key: 'leftLeg', label: 'humanSceneLeftLeg', ...JOINT_LIMITS.leftLeg },
  { key: 'rightLeg', label: 'humanSceneRightLeg', ...JOINT_LIMITS.rightLeg },
  { key: 'leftKnee', label: 'humanSceneLeftKnee', ...JOINT_LIMITS.leftKnee },
  { key: 'rightKnee', label: 'humanSceneRightKnee', ...JOINT_LIMITS.rightKnee },
]

type ActiveDrag =
  | {
      kind: 'body'
      personId: string
      pointerId: number
      svg: SVGSVGElement
      viewport: HumanSceneViewport
      pointerToBaseOffset: Point
    }
  | {
      kind: 'joint'
      personId: string
      pointerId: number
      svg: SVGSVGElement
      viewport: HumanSceneViewport
      joint: JointKey
    }

function ownerSvgFromElement(element: EventTarget | null): SVGSVGElement | null {
  if (!(element instanceof Element)) return null
  if (element instanceof SVGSVGElement) return element
  if (element instanceof SVGElement) return element.ownerSVGElement

  return element.closest('svg')
}

function clientPointToStagePoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  aspect: HumanScene['stage']['aspect'],
  viewport: HumanSceneViewport = DEFAULT_HUMAN_SCENE_VIEWPORT,
): Point {
  const rect = svg.getBoundingClientRect()
  const stage = stageSizeForAspect(aspect)
  const viewBox = humanSceneViewBox(stage, viewport)
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height)

  if (!Number.isFinite(scale) || scale <= 0) {
    return { x: clientX, y: clientY }
  }

  const renderedWidth = viewBox.width * scale
  const renderedHeight = viewBox.height * scale
  const offsetX = (rect.width - renderedWidth) / 2
  const offsetY = (rect.height - renderedHeight) / 2

  return {
    x: viewBox.x + (clientX - rect.left - offsetX) / scale,
    y: viewBox.y + (clientY - rect.top - offsetY) / scale,
  }
}

function jointAngleFromPointer(joint: JointKey, geometry: FigureGeometry, pointer: Point): number {
  const degrees = (() => {
    if (joint === 'rightArm') return angleFromDown(geometry.rightShoulder, pointer) - 18
    if (joint === 'leftArm') return -angleFromDown(geometry.leftShoulder, pointer) - 18
    if (joint === 'rightElbow') return angleFromDown(geometry.rightShoulder, pointer)
    if (joint === 'leftElbow') return -angleFromDown(geometry.leftShoulder, pointer)
    if (joint === 'rightLeg') return angleFromDown(geometry.rightHip, pointer) - 12
    if (joint === 'leftLeg') return angleFromDown(geometry.leftHip, pointer) + 12
    if (joint === 'rightKnee') return angleFromDown(geometry.rightHip, pointer)
    if (joint === 'leftKnee') return angleFromDown(geometry.leftHip, pointer)
    if (joint === 'torso') {
      return (
        Math.asin(clamp((pointer.x - geometry.hip.x) / (18 * geometry.scale), -1, 1)) *
        (180 / Math.PI)
      )
    }

    return (
      Math.asin(clamp((pointer.x - geometry.shoulder.x) / (8 * geometry.scale), -1, 1)) *
      (180 / Math.PI)
    )
  })()
  const limit = JOINT_LIMITS[joint]

  return clampAngle(degrees, limit.min, limit.max)
}

export default function HumanSceneEditor({
  scene,
  onChange,
}: {
  scene: HumanScene
  onChange: (scene: HumanScene) => void
}) {
  const t = useT()
  const normalized = useMemo(() => normalizeHumanScene(scene), [scene])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [previewViewport, setPreviewViewport] = useState<HumanSceneViewport>(
    DEFAULT_HUMAN_SCENE_VIEWPORT,
  )
  const selectedPerson =
    normalized.people.find((person) => person.id === selectedId) ?? normalized.people[0]
  const canAddPerson = normalized.people.length < 4

  useEffect(() => {
    if (!selectedPerson) {
      setSelectedId(null)
      return
    }

    if (selectedPerson.id !== selectedId) {
      setSelectedId(selectedPerson.id)
    }
  }, [selectedId, selectedPerson])

  function emitPeople(people: HumanFigure[]) {
    onChange(normalizeHumanScene({ ...normalized, people }))
  }

  function updatePerson(personId: string, patch: Partial<HumanFigure>) {
    emitPeople(
      normalized.people.map((person) =>
        person.id === personId ? { ...person, ...patch } : person,
      ),
    )
  }

  function updateSelectedPerson(patch: Partial<HumanFigure>) {
    if (!selectedPerson) return

    updatePerson(selectedPerson.id, patch)
  }

  function updateSelectedJoint(joint: JointKey, value: number) {
    if (!selectedPerson) return
    updateSelectedPerson({
      joints: {
        ...selectedPerson.joints,
        [joint]: value,
      },
    })
  }

  function addPerson() {
    if (!canAddPerson) return

    const nextIndex = normalized.people.length
    const nextPerson = createDefaultHumanFigure(nextIndex)
    emitPeople([...normalized.people, nextPerson])
    setSelectedId(nextPerson.id)
  }

  function removeSelectedPerson() {
    if (!selectedPerson) return

    const remainingPeople = normalized.people
      .filter((person) => person.id !== selectedPerson.id)
      .map((person) =>
        person.facingTargetId === selectedPerson.id
          ? { ...person, facing: 'front' as const, facingTargetId: undefined }
          : person,
      )
    emitPeople(remainingPeople)
    setSelectedId(remainingPeople[0]?.id ?? null)
  }

  function startDrag(target: DragTarget, event: React.PointerEvent<SVGElement>) {
    const svg = ownerSvgFromElement(event.currentTarget)
    const person = normalized.people.find((candidate) => candidate.id === target.personId)
    if (!svg || !person) return

    const pointer = clientPointToStagePoint(
      svg,
      event.clientX,
      event.clientY,
      normalized.stage.aspect,
      previewViewport,
    )
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : -1
    setSelectedId(target.personId)

    if (target.kind === 'body') {
      const geometry = figureGeometry(person, normalized.people, normalized.stage.aspect)
      setActiveDrag({
        kind: 'body',
        personId: target.personId,
        pointerId,
        svg,
        viewport: previewViewport,
        pointerToBaseOffset: {
          x: pointer.x - geometry.base.x,
          y: pointer.y - geometry.base.y,
        },
      })
      return
    }

    setActiveDrag({
      kind: 'joint',
      personId: target.personId,
      pointerId,
      svg,
      viewport: previewViewport,
      joint: target.joint,
    })
  }

  useEffect(() => {
    if (!activeDrag) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      if (activeDrag.pointerId !== -1 && event.pointerId !== activeDrag.pointerId) return

      event.preventDefault()
      const pointer = clientPointToStagePoint(
        activeDrag.svg,
        event.clientX,
        event.clientY,
        normalized.stage.aspect,
        activeDrag.viewport,
      )

      if (activeDrag.kind === 'body') {
        const nextPosition = pointToStagePercent(
          {
            x: pointer.x - activeDrag.pointerToBaseOffset.x,
            y: pointer.y - activeDrag.pointerToBaseOffset.y,
          },
          normalized.stage.aspect,
        )
        updatePerson(activeDrag.personId, { x: nextPosition.x, y: nextPosition.y })
        return
      }

      const person = normalized.people.find((candidate) => candidate.id === activeDrag.personId)
      if (!person) return

      const geometry = figureGeometry(person, normalized.people, normalized.stage.aspect)
      updatePerson(activeDrag.personId, {
        joints: {
          ...person.joints,
          [activeDrag.joint]: jointAngleFromPointer(activeDrag.joint, geometry, pointer),
        },
      })
    }
    const finishDrag = (event: PointerEvent) => {
      if (activeDrag.pointerId !== -1 && event.pointerId !== activeDrag.pointerId) return
      setActiveDrag(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
    }
  }, [activeDrag, normalized])

  function rangeControl({
    label,
    value,
    min,
    max,
    step,
    onChange,
  }: {
    label: string
    value: number
    min: number
    max: number
    step: number
    onChange: (value: number) => void
  }) {
    return (
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{label}</span>
          <span className="muted">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
        </span>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <HumanSceneInteractivePreview
        scene={normalized}
        selectedPersonId={selectedPerson?.id ?? null}
        height={260}
        viewport={previewViewport}
        onSelectPerson={setSelectedId}
        onDragStart={startDrag}
        onViewportChange={setPreviewViewport}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {normalized.people.map((person) => (
          <button
            key={person.id}
            type="button"
            aria-pressed={person.id === selectedPerson?.id}
            onClick={() => setSelectedId(person.id)}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 10px',
              background: person.id === selectedPerson?.id ? 'var(--accent)' : 'var(--bg-elevated)',
              color: person.id === selectedPerson?.id ? 'white' : 'var(--text)',
            }}
          >
            {person.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!canAddPerson}
          onClick={addPerson}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
          }}
        >
          {canAddPerson ? t('humanSceneAddPerson') : t('humanSceneMaxPeople')}
        </button>
        {selectedPerson ? (
          <button
            type="button"
            onClick={removeSelectedPerson}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 10px',
              background: 'var(--bg-elevated)',
              color: 'var(--danger)',
            }}
          >
            {t('humanSceneRemovePerson')}
          </button>
        ) : null}
      </div>

      {selectedPerson ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>{t('humanScenePose')}</span>
            <select
              aria-label={t('humanScenePose')}
              value={selectedPerson.posePreset}
              onChange={(event) =>
                updateSelectedPerson({ posePreset: event.target.value as HumanPosePreset })
              }
            >
              {POSE_PRESETS.map((pose) => (
                <option key={pose} value={pose}>
                  {pose}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span>{t('humanSceneFacing')}</span>
            <select
              aria-label={t('humanSceneFacing')}
              value={selectedPerson.facing}
              onChange={(event) => {
                const facing = event.target.value as HumanFigureFacing
                const target = normalized.people.find((person) => person.id !== selectedPerson.id)
                updateSelectedPerson({
                  facing,
                  facingTargetId: facing === 'toward-person' ? target?.id : undefined,
                })
              }}
            >
              {FACING_VALUES.map((facing) => (
                <option key={facing} value={facing}>
                  {facing}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            {rangeControl({
              label: t('humanScenePositionX'),
              value: selectedPerson.x,
              min: 0,
              max: 100,
              step: 1,
              onChange: (x) => updateSelectedPerson({ x }),
            })}
            {rangeControl({
              label: t('humanScenePositionY'),
              value: selectedPerson.y,
              min: 0,
              max: 100,
              step: 1,
              onChange: (y) => updateSelectedPerson({ y }),
            })}
            {rangeControl({
              label: t('humanSceneDepth'),
              value: selectedPerson.zDepth,
              min: 0,
              max: 1,
              step: 0.01,
              onChange: (zDepth) => updateSelectedPerson({ zDepth }),
            })}
            {rangeControl({
              label: t('humanSceneScale'),
              value: selectedPerson.scale,
              min: 0.5,
              max: 1.5,
              step: 0.05,
              onChange: (scale) => updateSelectedPerson({ scale }),
            })}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{t('humanSceneManualPose')}</strong>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 10,
              }}
            >
              {JOINT_CONTROLS.map((control) => (
                <div key={control.key}>
                  {rangeControl({
                    label: t(control.label),
                    value: selectedPerson.joints[control.key],
                    min: control.min,
                    max: control.max,
                    step: 1,
                    onChange: (value) => updateSelectedJoint(control.key, value),
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
