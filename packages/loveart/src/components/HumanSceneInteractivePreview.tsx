import { useEffect, useState } from 'react'
import type React from 'react'
import type { HumanFigure, HumanFigureJoints, HumanScene, HumanSceneAspect } from '../types'
import { figureGeometry, stageSizeForAspect } from '../services/humanSceneGeometry'
import type { FigureGeometry, Point, StageSize } from '../services/humanSceneGeometry'
import { normalizeHumanScene } from '../services/humanScene'

export type DragTarget =
  | { kind: 'body'; personId: string }
  | { kind: 'joint'; personId: string; joint: keyof HumanFigureJoints }

export interface HumanSceneViewport {
  zoom: number
  panX: number
  panY: number
}

export interface HumanSceneViewBox {
  x: number
  y: number
  width: number
  height: number
}

interface HumanSceneInteractivePreviewProps {
  scene: HumanScene
  aspect?: HumanSceneAspect
  selectedPersonId?: string | null
  height?: number
  viewport?: HumanSceneViewport
  onSelectPerson?: (personId: string) => void
  onDragStart?: (target: DragTarget, event: React.PointerEvent<SVGElement>) => void
  onViewportChange?: (viewport: HumanSceneViewport) => void
}

export const DEFAULT_HUMAN_SCENE_VIEWPORT: HumanSceneViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
}

const MIN_ZOOM = 0.75
const MAX_ZOOM = 3
const ZOOM_STEP = 1.2

const JOINT_HANDLES: Array<keyof HumanFigureJoints> = [
  'head',
  'torso',
  'leftArm',
  'rightArm',
  'leftElbow',
  'rightElbow',
  'leftLeg',
  'rightLeg',
  'leftKnee',
  'rightKnee',
]

function figureBounds(geometry: FigureGeometry): {
  x: number
  y: number
  width: number
  height: number
} {
  const points = [
    geometry.base,
    geometry.hip,
    geometry.shoulder,
    geometry.leftShoulder,
    geometry.rightShoulder,
    geometry.leftHip,
    geometry.rightHip,
    geometry.leftElbow,
    geometry.rightElbow,
    geometry.leftHand,
    geometry.rightHand,
    geometry.leftKnee,
    geometry.rightKnee,
    geometry.leftFoot,
    geometry.rightFoot,
  ]
  const xValues = [
    ...points.map((point) => point.x),
    geometry.head.x - geometry.headRadius,
    geometry.head.x + geometry.headRadius,
  ]
  const yValues = [
    ...points.map((point) => point.y),
    geometry.head.y - geometry.headRadius,
    geometry.head.y + geometry.headRadius,
  ]
  const padding = 16 * geometry.scale
  const minX = Math.min(...xValues) - padding
  const minY = Math.min(...yValues) - padding
  const maxX = Math.max(...xValues) + padding
  const maxY = Math.max(...yValues) + padding

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function jointPoint(joint: keyof HumanFigureJoints, geometry: FigureGeometry): Point {
  if (joint === 'head') return geometry.head
  if (joint === 'torso') return geometry.shoulder
  if (joint === 'leftArm') return geometry.leftHand
  if (joint === 'rightArm') return geometry.rightHand
  if (joint === 'leftElbow') return geometry.leftElbow
  if (joint === 'rightElbow') return geometry.rightElbow
  if (joint === 'leftLeg') return geometry.leftFoot
  if (joint === 'leftKnee') return geometry.leftKnee
  if (joint === 'rightKnee') return geometry.rightKnee

  return geometry.rightFoot
}

function jointLabel(joint: keyof HumanFigureJoints): string {
  if (joint === 'leftArm') return 'LA'
  if (joint === 'rightArm') return 'RA'
  if (joint === 'leftElbow') return 'LE'
  if (joint === 'rightElbow') return 'RE'
  if (joint === 'leftLeg') return 'LL'
  if (joint === 'rightLeg') return 'RL'
  if (joint === 'leftKnee') return 'LK'
  if (joint === 'rightKnee') return 'RK'
  if (joint === 'head') return 'H'

  return 'T'
}

function handleKeyDown(
  personId: string,
  onSelectPerson: ((personId: string) => void) | undefined,
  event: React.KeyboardEvent<SVGGElement>,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return

  event.preventDefault()
  onSelectPerson?.(personId)
}

function focusId(target: DragTarget): string {
  return target.kind === 'body'
    ? `body:${target.personId}`
    : `joint:${target.personId}:${target.joint}`
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizedViewport(viewport: HumanSceneViewport): HumanSceneViewport {
  return {
    zoom: clampValue(viewport.zoom, MIN_ZOOM, MAX_ZOOM),
    panX: viewport.panX,
    panY: viewport.panY,
  }
}

export function humanSceneViewBox(
  stage: StageSize,
  viewport: HumanSceneViewport,
): HumanSceneViewBox {
  const normalized = normalizedViewport(viewport)
  const width = stage.width / normalized.zoom
  const height = stage.height / normalized.zoom

  return {
    x: (stage.width - width) / 2 - normalized.panX,
    y: (stage.height - height) / 2 - normalized.panY,
    width,
    height,
  }
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function formatViewBox(viewBox: HumanSceneViewBox): string {
  return [
    formatNumber(viewBox.x),
    formatNumber(viewBox.y),
    formatNumber(viewBox.width),
    formatNumber(viewBox.height),
  ].join(' ')
}

function renderedScale(svg: SVGSVGElement, viewBox: HumanSceneViewBox): number {
  const rect = svg.getBoundingClientRect()
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height)

  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

type ActivePan = {
  pointerId: number
  startClientX: number
  startClientY: number
  startViewport: HumanSceneViewport
  scale: number
}

export default function HumanSceneInteractivePreview({
  scene,
  aspect,
  selectedPersonId,
  height = 180,
  viewport,
  onSelectPerson,
  onDragStart,
  onViewportChange,
}: HumanSceneInteractivePreviewProps) {
  const [focusedTarget, setFocusedTarget] = useState<string | null>(null)
  const [internalViewport, setInternalViewport] = useState<HumanSceneViewport>(
    DEFAULT_HUMAN_SCENE_VIEWPORT,
  )
  const [activePan, setActivePan] = useState<ActivePan | null>(null)
  const normalized = normalizeHumanScene(scene)
  const previewAspect = aspect ?? normalized.stage.aspect
  const stageSize = stageSizeForAspect(previewAspect)
  const { width, height: stageHeight } = stageSize
  const effectiveViewport = normalizedViewport(viewport ?? internalViewport)
  const viewBox = humanSceneViewBox(stageSize, effectiveViewport)
  const stageBottom = stageHeight * 0.9
  const stageTop = stageHeight * 0.22
  const centerX = width / 2
  const floorHalfTop = width * 0.28
  const floorHalfBottom = width * 0.46
  const sortedPeople = normalized.people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => b.person.zDepth - a.person.zDepth || a.index - b.index)

  const startDrag = (target: DragTarget, event: React.PointerEvent<SVGElement>) => {
    event.stopPropagation()
    if (
      typeof event.pointerId === 'number' &&
      typeof event.currentTarget.setPointerCapture === 'function'
    ) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Some SVG elements or test environments expose the method but reject capture.
      }
    }
    onSelectPerson?.(target.personId)
    onDragStart?.(target, event)
  }

  const updateViewport = (nextViewport: HumanSceneViewport) => {
    const next = normalizedViewport(nextViewport)

    if (onViewportChange) {
      onViewportChange(next)
    } else {
      setInternalViewport(next)
    }
  }

  const zoomTo = (zoom: number) => {
    updateViewport({ ...effectiveViewport, zoom })
  }

  const handlePanStart = (event: React.PointerEvent<SVGRectElement>) => {
    if (!event.currentTarget.ownerSVGElement) return
    event.stopPropagation()
    const svg = event.currentTarget.ownerSVGElement
    if (
      typeof event.pointerId === 'number' &&
      typeof event.currentTarget.setPointerCapture === 'function'
    ) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Some SVG elements or test environments expose the method but reject capture.
      }
    }
    setActivePan({
      pointerId: typeof event.pointerId === 'number' ? event.pointerId : -1,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: effectiveViewport,
      scale: renderedScale(svg, viewBox),
    })
  }

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    zoomTo(effectiveViewport.zoom * factor)
  }

  useEffect(() => {
    if (!activePan) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      if (activePan.pointerId !== -1 && event.pointerId !== activePan.pointerId) return
      event.preventDefault()
      updateViewport({
        ...activePan.startViewport,
        panX:
          activePan.startViewport.panX + (event.clientX - activePan.startClientX) / activePan.scale,
        panY:
          activePan.startViewport.panY + (event.clientY - activePan.startClientY) / activePan.scale,
      })
    }
    const finishPan = (event: PointerEvent) => {
      if (activePan.pointerId !== -1 && event.pointerId !== activePan.pointerId) return
      setActivePan(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishPan)
    window.addEventListener('pointercancel', finishPan)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishPan)
      window.removeEventListener('pointercancel', finishPan)
    }
  }, [activePan])

  return (
    <div
      role="group"
      aria-label={`${normalized.name} interactive preview`}
      data-touch-action="none"
      style={{
        height,
        width: '100%',
        overflow: 'hidden',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-base)',
        touchAction: 'none',
        position: 'relative',
      }}
    >
      <svg
        data-touch-action="none"
        viewBox={formatViewBox(viewBox)}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        style={{ display: 'block', touchAction: 'none' }}
      >
        <rect
          data-testid="human-scene-preview-pan-surface"
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill="#f8fafc"
          onPointerDown={handlePanStart}
          style={{ cursor: activePan ? 'grabbing' : 'grab', touchAction: 'none' }}
        />
        <g pointerEvents="none">
          <text
            x={width * 0.04}
            y={stageHeight * 0.08}
            fontFamily="Inter, system-ui, sans-serif"
            fontSize={Math.min(width, stageHeight) * 0.036}
            fontWeight={700}
            fill="#0f172a"
          >
            {normalized.name}
          </text>
          <polygon
            points={`${centerX - floorHalfTop},${stageTop} ${centerX + floorHalfTop},${stageTop} ${
              centerX + floorHalfBottom
            },${stageBottom} ${centerX - floorHalfBottom},${stageBottom}`}
            fill="#e2e8f0"
            stroke="#94a3b8"
            strokeWidth={3}
          />
          <line
            x1={centerX - floorHalfTop}
            y1={stageTop}
            x2={centerX - floorHalfBottom}
            y2={stageBottom}
            stroke="#cbd5e1"
            strokeWidth={2}
          />
          <line
            x1={centerX + floorHalfTop}
            y1={stageTop}
            x2={centerX + floorHalfBottom}
            y2={stageBottom}
            stroke="#cbd5e1"
            strokeWidth={2}
          />
          <line
            x1={centerX - floorHalfTop * 0.72}
            y1={stageTop + (stageBottom - stageTop) * 0.34}
            x2={centerX + floorHalfTop * 0.72}
            y2={stageTop + (stageBottom - stageTop) * 0.34}
            stroke="#cbd5e1"
            strokeWidth={2}
          />
          <line
            x1={centerX - floorHalfTop * 0.9}
            y1={stageTop + (stageBottom - stageTop) * 0.66}
            x2={centerX + floorHalfTop * 0.9}
            y2={stageTop + (stageBottom - stageTop) * 0.66}
            stroke="#cbd5e1"
            strokeWidth={2}
          />
        </g>

        {sortedPeople.map(({ person }) => {
          const geometry = figureGeometry(person, normalized.people, previewAspect)
          const bounds = figureBounds(geometry)
          const selected = person.id === selectedPersonId
          const bodyTarget: DragTarget = { kind: 'body', personId: person.id }
          const bodyFocused = focusedTarget === focusId(bodyTarget)

          return (
            <g
              key={person.id}
              data-testid={`human-scene-person-${person.id}`}
              data-selected={selected}
            >
              {selected ? (
                <rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                  rx={4 * geometry.scale}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth={Math.max(3, 3.6 * geometry.scale)}
                  strokeDasharray={`${9 * geometry.scale} ${5 * geometry.scale}`}
                  pointerEvents="none"
                />
              ) : null}
              <FigureBody
                person={person}
                geometry={geometry}
                bounds={bounds}
                selected={selected}
                focused={bodyFocused}
                onPointerDown={(event) => startDrag(bodyTarget, event)}
                onKeyDown={(event) => handleKeyDown(person.id, onSelectPerson, event)}
                onFocus={() => setFocusedTarget(focusId(bodyTarget))}
                onBlur={() => setFocusedTarget(null)}
              />
              <BodyHandle
                person={person}
                geometry={geometry}
                selected={selected}
                focused={bodyFocused}
                onPointerDown={(event) => startDrag(bodyTarget, event)}
                onKeyDown={(event) => handleKeyDown(person.id, onSelectPerson, event)}
                onFocus={() => setFocusedTarget(focusId(bodyTarget))}
                onBlur={() => setFocusedTarget(null)}
              />
              {JOINT_HANDLES.map((joint) => {
                const jointTarget: DragTarget = { kind: 'joint', personId: person.id, joint }

                return (
                  <JointHandle
                    key={joint}
                    person={person}
                    joint={joint}
                    geometry={geometry}
                    selected={selected}
                    focused={focusedTarget === focusId(jointTarget)}
                    onPointerDown={(event) => startDrag(jointTarget, event)}
                    onKeyDown={(event) => handleKeyDown(person.id, onSelectPerson, event)}
                    onFocus={() => setFocusedTarget(focusId(jointTarget))}
                    onBlur={() => setFocusedTarget(null)}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
      <div
        aria-label="Preview view controls"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'rgba(248, 250, 252, 0.92)',
        }}
      >
        <button
          type="button"
          aria-label="Zoom out preview"
          title="Zoom out"
          onClick={() => zoomTo(effectiveViewport.zoom / ZOOM_STEP)}
          style={viewButtonStyle}
        >
          -
        </button>
        <span
          aria-label="Preview zoom"
          style={{ minWidth: 42, textAlign: 'center', fontSize: 12, color: '#0f172a' }}
        >
          {Math.round(effectiveViewport.zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in preview"
          title="Zoom in"
          onClick={() => zoomTo(effectiveViewport.zoom * ZOOM_STEP)}
          style={viewButtonStyle}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Reset preview view"
          title="Reset view"
          onClick={() => updateViewport(DEFAULT_HUMAN_SCENE_VIEWPORT)}
          style={viewButtonStyle}
        >
          ↺
        </button>
      </div>
    </div>
  )
}

const viewButtonStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-grid',
  placeItems: 'center',
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
  lineHeight: 1,
}

function FigureBody({
  person,
  geometry,
  bounds,
  selected,
  focused,
  onPointerDown,
  onKeyDown,
  onFocus,
  onBlur,
}: {
  person: HumanFigure
  geometry: FigureGeometry
  bounds: { x: number; y: number; width: number; height: number }
  selected: boolean
  focused: boolean
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void
  onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => void
  onFocus: () => void
  onBlur: () => void
}) {
  const {
    base,
    hip,
    shoulder,
    head,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftElbow,
    rightElbow,
    leftHand,
    rightHand,
    leftKnee,
    rightKnee,
    leftFoot,
    rightFoot,
    headRadius,
    color,
    scale,
    eyeOffset,
  } = geometry

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select ${person.label}`}
      data-person-id={person.id}
      data-drag-target="body"
      data-selected={selected}
      data-focused={focused}
      data-touch-action="none"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      opacity={0.82 + (1 - person.zDepth) * 0.18}
      style={{ cursor: 'grab', touchAction: 'none' }}
    >
      {focused ? (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={4 * scale}
          fill="none"
          stroke="#0284c7"
          strokeWidth={Math.max(3, 3.4 * scale)}
          pointerEvents="none"
        />
      ) : null}
      <ellipse
        cx={base.x}
        cy={base.y + 8 * scale}
        rx={46 * scale}
        ry={10 * scale}
        fill="#0f172a"
        opacity={0.12}
      />
      <line
        x1={leftHip.x}
        y1={leftHip.y}
        x2={leftKnee.x}
        y2={leftKnee.y}
        stroke={color}
        strokeWidth={10 * scale}
        strokeLinecap="round"
      />
      <line
        x1={leftKnee.x}
        y1={leftKnee.y}
        x2={leftFoot.x}
        y2={leftFoot.y}
        stroke={color}
        strokeWidth={10 * scale}
        strokeLinecap="round"
      />
      <line
        x1={rightHip.x}
        y1={rightHip.y}
        x2={rightKnee.x}
        y2={rightKnee.y}
        stroke={color}
        strokeWidth={10 * scale}
        strokeLinecap="round"
      />
      <line
        x1={rightKnee.x}
        y1={rightKnee.y}
        x2={rightFoot.x}
        y2={rightFoot.y}
        stroke={color}
        strokeWidth={10 * scale}
        strokeLinecap="round"
      />
      <line
        x1={leftShoulder.x}
        y1={leftShoulder.y}
        x2={leftElbow.x}
        y2={leftElbow.y}
        stroke={color}
        strokeWidth={9 * scale}
        strokeLinecap="round"
      />
      <line
        x1={leftElbow.x}
        y1={leftElbow.y}
        x2={leftHand.x}
        y2={leftHand.y}
        stroke={color}
        strokeWidth={9 * scale}
        strokeLinecap="round"
      />
      <line
        x1={rightShoulder.x}
        y1={rightShoulder.y}
        x2={rightElbow.x}
        y2={rightElbow.y}
        stroke={color}
        strokeWidth={9 * scale}
        strokeLinecap="round"
      />
      <line
        x1={rightElbow.x}
        y1={rightElbow.y}
        x2={rightHand.x}
        y2={rightHand.y}
        stroke={color}
        strokeWidth={9 * scale}
        strokeLinecap="round"
      />
      <line
        x1={shoulder.x}
        y1={shoulder.y}
        x2={hip.x}
        y2={hip.y}
        stroke={color}
        strokeWidth={18 * scale}
        strokeLinecap="round"
      />
      <circle
        cx={head.x}
        cy={head.y}
        r={headRadius}
        fill="#f8fafc"
        stroke={color}
        strokeWidth={6 * scale}
      />
      <circle
        cx={shoulder.x + eyeOffset}
        cy={head.y}
        r={3.5 * scale}
        fill={person.facing === 'back' ? '#94a3b8' : '#0f172a'}
      />
      <text
        x={base.x}
        y={base.y + 38 * scale}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={24 * scale}
        fontWeight={700}
        fill="#0f172a"
      >
        {person.label}
      </text>
    </g>
  )
}

function BodyHandle({
  person,
  geometry,
  selected,
  focused,
  onPointerDown,
  onKeyDown,
  onFocus,
  onBlur,
}: {
  person: HumanFigure
  geometry: FigureGeometry
  selected: boolean
  focused: boolean
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void
  onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => void
  onFocus: () => void
  onBlur: () => void
}) {
  const radius = selected ? Math.max(11, 12 * geometry.scale) : Math.max(9, 10 * geometry.scale)

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select ${person.label} body handle`}
      data-person-id={person.id}
      data-drag-target="body-handle"
      data-selected={selected}
      data-focused={focused}
      data-touch-action="none"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{ cursor: 'grab', touchAction: 'none' }}
    >
      {focused ? (
        <circle
          cx={geometry.base.x}
          cy={geometry.base.y}
          r={radius + Math.max(5, 5 * geometry.scale)}
          fill="none"
          stroke="#0284c7"
          strokeWidth={Math.max(3, 3 * geometry.scale)}
          pointerEvents="none"
        />
      ) : null}
      <circle
        cx={geometry.base.x}
        cy={geometry.base.y}
        r={radius}
        fill={selected ? '#f97316' : '#ffffff'}
        stroke="#0f172a"
        strokeWidth={selected ? 3 : 2}
      />
      <circle
        cx={geometry.base.x}
        cy={geometry.base.y}
        r={Math.max(2.8, 3.4 * geometry.scale)}
        fill={selected ? '#ffffff' : '#0f172a'}
        pointerEvents="none"
      />
    </g>
  )
}

function JointHandle({
  person,
  joint,
  geometry,
  selected,
  focused,
  onPointerDown,
  onKeyDown,
  onFocus,
  onBlur,
}: {
  person: HumanFigure
  joint: keyof HumanFigureJoints
  geometry: FigureGeometry
  selected: boolean
  focused: boolean
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void
  onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => void
  onFocus: () => void
  onBlur: () => void
}) {
  const point = jointPoint(joint, geometry)
  const radius = selected ? Math.max(8, 8.4 * geometry.scale) : Math.max(6, 6.8 * geometry.scale)
  const fontSize = Math.max(10, 12 * geometry.scale)

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select ${person.label} ${joint} handle`}
      data-person-id={person.id}
      data-joint={joint}
      data-selected={selected}
      data-focused={focused}
      data-touch-action="none"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{ cursor: 'grab', touchAction: 'none' }}
    >
      {focused ? (
        <circle
          cx={point.x}
          cy={point.y}
          r={radius + Math.max(4, 4 * geometry.scale)}
          fill="none"
          stroke="#0284c7"
          strokeWidth={Math.max(2.8, 3 * geometry.scale)}
          pointerEvents="none"
        />
      ) : null}
      <circle
        cx={point.x}
        cy={point.y}
        r={radius}
        fill={selected ? '#f97316' : '#facc15'}
        stroke="#0f172a"
        strokeWidth={selected ? 2.8 : 2}
      />
      <text
        x={point.x + 8 * geometry.scale}
        y={point.y - 8 * geometry.scale}
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={fontSize}
        fontWeight={800}
        fill="#0f172a"
        pointerEvents="none"
      >
        {jointLabel(joint)}
      </text>
    </g>
  )
}
