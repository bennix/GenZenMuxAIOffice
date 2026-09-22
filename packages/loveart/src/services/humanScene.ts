import type {
  HumanFigure,
  HumanFigureFacing,
  HumanFigureJoints,
  HumanFigureLabel,
  HumanPosePreset,
  HumanScene,
  HumanSceneAspect,
} from '../types'
import type { Lang } from '../store/settingsStore'
import { figureGeometry, JOINT_LIMITS, stageSizeForAspect } from './humanSceneGeometry'
import type { FigureGeometry, Point } from './humanSceneGeometry'

const HUMAN_LABELS: HumanFigureLabel[] = ['Person A', 'Person B', 'Person C', 'Person D']
const HUMAN_SCENE_ASPECTS = new Set<HumanSceneAspect>(['16:9', '9:16', '1:1'])

const POSE_PRESETS = new Set<HumanPosePreset>([
  'standing',
  'sitting',
  'walking',
  'waving',
  'talking',
  'pointing',
  'turning',
])

const FACING_VALUES = new Set<HumanFigureFacing>([
  'left',
  'right',
  'front',
  'back',
  'toward-person',
])

const DEFAULT_JOINTS: HumanFigureJoints = {
  head: 0,
  torso: 0,
  leftArm: 0,
  rightArm: 0,
  leftElbow: 18,
  rightElbow: 18,
  leftLeg: 0,
  rightLeg: 0,
  leftKnee: 12,
  rightKnee: 12,
}

export interface HumanSceneGenerationContext {
  textConstraint: string
  summary: string
  referenceBlob?: Blob
}

export interface HumanSceneSvgOptions {
  annotations?: boolean
}

export interface HumanSceneTextConstraintOptions {
  includeControlGuidance?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function stageAspect(value: unknown): HumanSceneAspect {
  return typeof value === 'string' && HUMAN_SCENE_ASPECTS.has(value as HumanSceneAspect)
    ? (value as HumanSceneAspect)
    : '16:9'
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function posePreset(value: unknown): HumanPosePreset {
  return typeof value === 'string' && POSE_PRESETS.has(value as HumanPosePreset)
    ? (value as HumanPosePreset)
    : 'standing'
}

function facingValue(value: unknown): HumanFigureFacing {
  return typeof value === 'string' && FACING_VALUES.has(value as HumanFigureFacing)
    ? (value as HumanFigureFacing)
    : 'front'
}

function normalizeJoints(joints: unknown): HumanFigureJoints {
  const source = isRecord(joints) ? joints : {}
  const normalizedJoint = (joint: keyof HumanFigureJoints): number => {
    const limit = JOINT_LIMITS[joint]

    return clamp(source[joint], limit.min, limit.max, DEFAULT_JOINTS[joint])
  }

  return {
    head: normalizedJoint('head'),
    torso: normalizedJoint('torso'),
    leftArm: normalizedJoint('leftArm'),
    rightArm: normalizedJoint('rightArm'),
    leftElbow: normalizedJoint('leftElbow'),
    rightElbow: normalizedJoint('rightElbow'),
    leftLeg: normalizedJoint('leftLeg'),
    rightLeg: normalizedJoint('rightLeg'),
    leftKnee: normalizedJoint('leftKnee'),
    rightKnee: normalizedJoint('rightKnee'),
  }
}

export function createDefaultHumanFigure(index: number): HumanFigure {
  const label = HUMAN_LABELS[clamp(index, 0, HUMAN_LABELS.length - 1, 0)]
  const offset = clamp(index, 0, HUMAN_LABELS.length - 1, 0)

  return {
    id: `person-${offset + 1}`,
    label,
    x: 30 + offset * 12,
    y: 68,
    zDepth: 0.35,
    scale: 1,
    facing: 'front',
    posePreset: 'standing',
    joints: { ...DEFAULT_JOINTS },
  }
}

export function createDefaultHumanScene(
  projectId: string,
  name: string,
  aspect: HumanSceneAspect,
): Omit<HumanScene, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    projectId,
    name,
    stage: { aspect, perspective: 'pseudo-3d' },
    people: [createDefaultHumanFigure(0)],
  }
}

export function normalizeHumanScene(scene: HumanScene): HumanScene {
  const source: Record<string, unknown> = isRecord(scene) ? scene : {}
  const stage: Record<string, unknown> = isRecord(source.stage) ? source.stage : {}
  const peopleSource: unknown[] = Array.isArray(source.people) ? source.people : []
  const normalizedPeople = peopleSource
    .filter(isRecord)
    .slice(0, HUMAN_LABELS.length)
    .map((person, index) => {
      const facing = facingValue(person.facing)

      return {
        id: stringValue(person.id, `person-${index + 1}`),
        label: HUMAN_LABELS[index],
        x: clamp(person.x, 0, 100, 50),
        y: clamp(person.y, 0, 100, 70),
        zDepth: clamp(person.zDepth, 0, 1, 0.5),
        scale: clamp(person.scale, 0.5, 1.5, 1),
        facing,
        facingTargetId:
          facing === 'toward-person' ? stringValue(person.facingTargetId, '') : undefined,
        posePreset: posePreset(person.posePreset),
        joints: normalizeJoints(person.joints),
      }
    })

  const normalizedIds = new Set(normalizedPeople.map((person) => person.id))
  const people = normalizedPeople.map((person) => ({
    ...person,
    facingTargetId:
      person.facing === 'toward-person' &&
      person.facingTargetId &&
      normalizedIds.has(person.facingTargetId)
        ? person.facingTargetId
        : undefined,
  }))

  return {
    id: stringValue(source.id, ''),
    projectId: stringValue(source.projectId, ''),
    name: stringValue(source.name, 'Human scene'),
    stage: {
      aspect: stageAspect(stage.aspect),
      perspective: 'pseudo-3d',
    },
    people,
    createdAt: clamp(source.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: clamp(source.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  }
}

function depthLabel(zDepth: number, lang: Lang): string {
  if (zDepth < 0.33) return lang === 'zh' ? '前景' : 'foreground'
  if (zDepth < 0.66) return lang === 'zh' ? '中景' : 'middle ground'
  return lang === 'zh' ? '背景' : 'background'
}

function poseLabel(pose: HumanPosePreset, lang: Lang): string {
  const labels: Record<Lang, Record<HumanPosePreset, string>> = {
    zh: {
      standing: '站立',
      sitting: '坐姿',
      walking: '行走',
      waving: '挥手',
      talking: '交谈',
      pointing: '指向',
      turning: '转身',
    },
    en: {
      standing: 'standing',
      sitting: 'sitting',
      walking: 'walking',
      waving: 'waving',
      talking: 'talking',
      pointing: 'pointing',
      turning: 'turning',
    },
  }

  return labels[lang][pose]
}

function facingLabel(person: HumanFigure, people: HumanFigure[], lang: Lang): string {
  if (person.facing === 'toward-person' && person.facingTargetId) {
    const target = people.find((candidate) => candidate.id === person.facingTargetId)
    if (target) return lang === 'zh' ? `面向 ${target.label}` : `facing ${target.label}`
  }

  const labels: Record<Lang, Record<Exclude<HumanFigureFacing, 'toward-person'>, string>> = {
    zh: {
      left: '面向左侧',
      right: '面向右侧',
      front: '面向镜头',
      back: '背向镜头',
    },
    en: {
      left: 'facing left',
      right: 'facing right',
      front: 'facing camera',
      back: 'facing away',
    },
  }

  return person.facing === 'toward-person' ? labels[lang].front : labels[lang][person.facing]
}

function figureLine(person: HumanFigure, people: HumanFigure[], lang: Lang): string {
  const details = [
    depthLabel(person.zDepth, lang),
    facingLabel(person, people, lang),
    poseLabel(person.posePreset, lang),
  ]

  if (person.joints.rightArm < -35) {
    details.push(lang === 'zh' ? '右臂抬起' : 'right arm raised')
  }

  const position =
    lang === 'zh'
      ? `位置 x=${Math.round(person.x)}%, y=${Math.round(person.y)}%`
      : `position x=${Math.round(person.x)}%, y=${Math.round(person.y)}%`

  return `- ${person.label}: ${details.join(lang === 'zh' ? '，' : ', ')}; ${position}`
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function renderFigure(
  person: HumanFigure,
  people: HumanFigure[],
  aspect: HumanSceneAspect,
): string {
  const geometry = figureGeometry(person, people, aspect)
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
  const label = escapeSvgText(person.label)

  return [
    `<g aria-label="${label}" opacity="${0.82 + (1 - person.zDepth) * 0.18}">`,
    `<ellipse cx="${base.x.toFixed(1)}" cy="${(base.y + 8 * scale).toFixed(1)}" rx="${(46 * scale).toFixed(1)}" ry="${(10 * scale).toFixed(1)}" fill="#0f172a" opacity="0.12"/>`,
    `<line x1="${leftHip.x.toFixed(1)}" y1="${leftHip.y.toFixed(1)}" x2="${leftKnee.x.toFixed(1)}" y2="${leftKnee.y.toFixed(1)}" stroke="${color}" stroke-width="${(10 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${leftKnee.x.toFixed(1)}" y1="${leftKnee.y.toFixed(1)}" x2="${leftFoot.x.toFixed(1)}" y2="${leftFoot.y.toFixed(1)}" stroke="${color}" stroke-width="${(10 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${rightHip.x.toFixed(1)}" y1="${rightHip.y.toFixed(1)}" x2="${rightKnee.x.toFixed(1)}" y2="${rightKnee.y.toFixed(1)}" stroke="${color}" stroke-width="${(10 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${rightKnee.x.toFixed(1)}" y1="${rightKnee.y.toFixed(1)}" x2="${rightFoot.x.toFixed(1)}" y2="${rightFoot.y.toFixed(1)}" stroke="${color}" stroke-width="${(10 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${leftShoulder.x.toFixed(1)}" y1="${leftShoulder.y.toFixed(1)}" x2="${leftElbow.x.toFixed(1)}" y2="${leftElbow.y.toFixed(1)}" stroke="${color}" stroke-width="${(9 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${leftElbow.x.toFixed(1)}" y1="${leftElbow.y.toFixed(1)}" x2="${leftHand.x.toFixed(1)}" y2="${leftHand.y.toFixed(1)}" stroke="${color}" stroke-width="${(9 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${rightShoulder.x.toFixed(1)}" y1="${rightShoulder.y.toFixed(1)}" x2="${rightElbow.x.toFixed(1)}" y2="${rightElbow.y.toFixed(1)}" stroke="${color}" stroke-width="${(9 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${rightElbow.x.toFixed(1)}" y1="${rightElbow.y.toFixed(1)}" x2="${rightHand.x.toFixed(1)}" y2="${rightHand.y.toFixed(1)}" stroke="${color}" stroke-width="${(9 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<line x1="${shoulder.x.toFixed(1)}" y1="${shoulder.y.toFixed(1)}" x2="${hip.x.toFixed(1)}" y2="${hip.y.toFixed(1)}" stroke="${color}" stroke-width="${(18 * scale).toFixed(1)}" stroke-linecap="round"/>`,
    `<circle cx="${head.x.toFixed(1)}" cy="${head.y.toFixed(1)}" r="${headRadius.toFixed(1)}" fill="#f8fafc" stroke="${color}" stroke-width="${(6 * scale).toFixed(1)}"/>`,
    `<circle cx="${(shoulder.x + eyeOffset).toFixed(1)}" cy="${head.y.toFixed(1)}" r="${(3.5 * scale).toFixed(1)}" fill="${person.facing === 'back' ? '#94a3b8' : '#0f172a'}"/>`,
    `<text x="${base.x.toFixed(1)}" y="${(base.y + 38 * scale).toFixed(1)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="${(24 * scale).toFixed(1)}" font-weight="700" fill="#0f172a">${label}</text>`,
    '</g>',
  ].join('')
}

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
  const padding = 14 * geometry.scale
  const minX = Math.min(...xValues) - padding
  const minY = Math.min(...yValues) - padding
  const maxX = Math.max(...xValues) + padding
  const maxY = Math.max(...yValues) + padding

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function facingVector(
  person: HumanFigure,
  people: HumanFigure[],
  aspect: HumanSceneAspect,
  geometry: FigureGeometry,
): Point {
  if (person.facing === 'left') return { x: -1, y: 0 }
  if (person.facing === 'right') return { x: 1, y: 0 }
  if (person.facing === 'back') return { x: 0, y: -1 }
  if (person.facing === 'toward-person' && person.facingTargetId) {
    const target = people.find((candidate) => candidate.id === person.facingTargetId)
    if (target) {
      const targetGeometry = figureGeometry(target, people, aspect)
      const dx = targetGeometry.base.x - geometry.base.x
      const dy = targetGeometry.base.y - geometry.base.y
      const length = Math.hypot(dx, dy) || 1

      return { x: dx / length, y: dy / length }
    }
  }

  return { x: 0, y: 1 }
}

function renderJointAnchor(
  point: Point,
  label: string,
  geometry: FigureGeometry,
  joint?: keyof HumanFigureJoints,
): string {
  const radius = Math.max(4, 4.6 * geometry.scale)
  const fontSize = Math.max(10, 12 * geometry.scale)
  const jointAttribute = joint ? ` data-joint="${joint}"` : ''

  return [
    `<circle data-control="joint-anchor"${jointAttribute} cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="#facc15" stroke="#0f172a" stroke-width="${Math.max(1.5, 1.8 * geometry.scale).toFixed(1)}"/>`,
    `<text x="${(point.x + 7 * geometry.scale).toFixed(1)}" y="${(point.y - 7 * geometry.scale).toFixed(1)}" font-family="Inter, system-ui, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="700" fill="#0f172a">${label}</text>`,
  ].join('')
}

function renderFigureAnnotations(
  person: HumanFigure,
  people: HumanFigure[],
  aspect: HumanSceneAspect,
  index: number,
): string {
  const geometry = figureGeometry(person, people, aspect)
  const bounds = figureBounds(geometry)
  const controlLabel = `P${index + 1}`
  const vector = facingVector(person, people, aspect, geometry)
  const arrowLength = 48 * geometry.scale
  const arrowStart = {
    x: geometry.head.x,
    y: geometry.head.y - geometry.headRadius - 12 * geometry.scale,
  }
  const arrowEnd = {
    x: arrowStart.x + vector.x * arrowLength,
    y: arrowStart.y + vector.y * arrowLength,
  }
  const labelX = Math.max(0, bounds.x)
  const labelY = Math.max(12, bounds.y - 8 * geometry.scale)

  return [
    `<g aria-label="${controlLabel} control marks" fill="none">`,
    `<rect data-control="person-box" x="${bounds.x.toFixed(1)}" y="${bounds.y.toFixed(1)}" width="${bounds.width.toFixed(1)}" height="${bounds.height.toFixed(1)}" rx="${(4 * geometry.scale).toFixed(1)}" stroke="#f97316" stroke-width="${Math.max(2, 2.5 * geometry.scale).toFixed(1)}" stroke-dasharray="${(8 * geometry.scale).toFixed(1)} ${(5 * geometry.scale).toFixed(1)}"/>`,
    `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" font-family="Inter, system-ui, sans-serif" font-size="${Math.max(14, 16 * geometry.scale).toFixed(1)}" font-weight="800" fill="#f97316">${controlLabel}</text>`,
    renderJointAnchor(geometry.head, 'head', geometry, 'head'),
    renderJointAnchor(geometry.shoulder, 'torso', geometry, 'torso'),
    renderJointAnchor(geometry.base, 'base', geometry),
    renderJointAnchor(geometry.leftElbow, 'LE', geometry, 'leftElbow'),
    renderJointAnchor(geometry.rightElbow, 'RE', geometry, 'rightElbow'),
    renderJointAnchor(geometry.leftHand, 'LH', geometry, 'leftArm'),
    renderJointAnchor(geometry.rightHand, 'RH', geometry, 'rightArm'),
    renderJointAnchor(geometry.leftKnee, 'LK', geometry, 'leftKnee'),
    renderJointAnchor(geometry.rightKnee, 'RK', geometry, 'rightKnee'),
    renderJointAnchor(geometry.leftFoot, 'LF', geometry, 'leftLeg'),
    renderJointAnchor(geometry.rightFoot, 'RF', geometry, 'rightLeg'),
    `<line data-control="facing-arrow" x1="${arrowStart.x.toFixed(1)}" y1="${arrowStart.y.toFixed(1)}" x2="${arrowEnd.x.toFixed(1)}" y2="${arrowEnd.y.toFixed(1)}" stroke="#0f172a" stroke-width="${Math.max(2, 3 * geometry.scale).toFixed(1)}" stroke-linecap="round" marker-end="url(#human-scene-facing-arrowhead)"/>`,
    `<text x="${(arrowEnd.x + 6 * geometry.scale).toFixed(1)}" y="${(arrowEnd.y - 6 * geometry.scale).toFixed(1)}" font-family="Inter, system-ui, sans-serif" font-size="${Math.max(10, 12 * geometry.scale).toFixed(1)}" font-weight="700" fill="#0f172a">facing</text>`,
    '</g>',
  ].join('')
}

export function humanSceneSummary(scene: HumanScene, lang: Lang): string {
  const normalized = normalizeHumanScene(scene)
  const count = normalized.people.length

  return lang === 'zh'
    ? `${normalized.name}: ${count} 人，伪 3D 人物站位`
    : `${normalized.name}: ${count} ${count === 1 ? 'person' : 'people'}, pseudo-3D blocking`
}

export function humanSceneTextConstraint(
  scene: HumanScene,
  lang: Lang,
  options: HumanSceneTextConstraintOptions = {},
): string {
  const normalized = normalizeHumanScene(scene)
  const count = normalized.people.length

  if (count === 0) return ''

  const controlGuidance =
    options.includeControlGuidance &&
    (lang === 'zh'
      ? '参考草图中的控制标记、人物框标签和关节点锚点是空间约束；生成时按这些框、锚点和朝向箭头保持人物位置与姿势。'
      : 'Use the sketch control marks, person box labels, and joint anchors as spatial constraints; preserve positions, poses, and facing arrows from those marks.')

  if (lang === 'zh') {
    return [
      '人物场景约束',
      `场景：${normalized.name}`,
      `共 ${count} 人，必须保持为 ${count} 人`,
      ...normalized.people.map((person) => figureLine(person, normalized.people, lang)),
      controlGuidance,
      '只约束人物站位、姿势、朝向和空间关系；不约束服装、身份、画风、镜头或背景细节。',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    'Human scene constraints',
    `Scene: ${normalized.name}`,
    `Exactly ${count} ${count === 1 ? 'person' : 'people'}`,
    ...normalized.people.map((person) => figureLine(person, normalized.people, lang)),
    controlGuidance,
    'Constrain blocking, pose, facing, and spatial relation only; do not constrain clothing, identity, style, camera, or background details.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function humanSceneSvg(
  scene: HumanScene,
  aspect: HumanSceneAspect,
  options: HumanSceneSvgOptions = {},
): string {
  const normalized = normalizeHumanScene(scene)
  const { width, height } = stageSizeForAspect(aspect)
  const title = escapeSvgText(normalized.name)
  const sortedPeopleWithIndex = normalized.people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => b.person.zDepth - a.person.zDepth || a.index - b.index)
  const stageBottom = height * 0.9
  const stageTop = height * 0.22
  const centerX = width / 2
  const floorHalfTop = width * 0.28
  const floorHalfBottom = width * 0.46

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`,
    '<rect width="100%" height="100%" fill="#f8fafc"/>',
    `<text x="${(width * 0.04).toFixed(1)}" y="${(height * 0.08).toFixed(1)}" font-family="Inter, system-ui, sans-serif" font-size="${(Math.min(width, height) * 0.036).toFixed(1)}" font-weight="700" fill="#0f172a">${title}</text>`,
    `<polygon points="${(centerX - floorHalfTop).toFixed(1)},${stageTop.toFixed(1)} ${(centerX + floorHalfTop).toFixed(1)},${stageTop.toFixed(1)} ${(centerX + floorHalfBottom).toFixed(1)},${stageBottom.toFixed(1)} ${(centerX - floorHalfBottom).toFixed(1)},${stageBottom.toFixed(1)}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>`,
    `<line x1="${(centerX - floorHalfTop).toFixed(1)}" y1="${stageTop.toFixed(1)}" x2="${(centerX - floorHalfBottom).toFixed(1)}" y2="${stageBottom.toFixed(1)}" stroke="#cbd5e1" stroke-width="2"/>`,
    `<line x1="${(centerX + floorHalfTop).toFixed(1)}" y1="${stageTop.toFixed(1)}" x2="${(centerX + floorHalfBottom).toFixed(1)}" y2="${stageBottom.toFixed(1)}" stroke="#cbd5e1" stroke-width="2"/>`,
    `<line x1="${(centerX - floorHalfTop * 0.72).toFixed(1)}" y1="${(stageTop + (stageBottom - stageTop) * 0.34).toFixed(1)}" x2="${(centerX + floorHalfTop * 0.72).toFixed(1)}" y2="${(stageTop + (stageBottom - stageTop) * 0.34).toFixed(1)}" stroke="#cbd5e1" stroke-width="2"/>`,
    `<line x1="${(centerX - floorHalfTop * 0.9).toFixed(1)}" y1="${(stageTop + (stageBottom - stageTop) * 0.66).toFixed(1)}" x2="${(centerX + floorHalfTop * 0.9).toFixed(1)}" y2="${(stageTop + (stageBottom - stageTop) * 0.66).toFixed(1)}" stroke="#cbd5e1" stroke-width="2"/>`,
    ...sortedPeopleWithIndex.map(({ person }) => renderFigure(person, normalized.people, aspect)),
    options.annotations
      ? [
          '<defs><marker id="human-scene-facing-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#0f172a"/></marker></defs>',
          ...sortedPeopleWithIndex.map(({ person, index }) =>
            renderFigureAnnotations(person, normalized.people, aspect, index),
          ),
        ].join('')
      : '',
    '</svg>',
  ].join('')
}

export async function renderHumanSceneSketch(
  scene: HumanScene,
  aspect: HumanSceneAspect,
): Promise<Blob> {
  return new Blob([humanSceneSvg(scene, aspect, { annotations: true })], { type: 'image/svg+xml' })
}

export async function humanSceneToGenerationContext(options: {
  scene: HumanScene
  aspect: HumanSceneAspect
  language: Lang
  includeReference: boolean
}): Promise<HumanSceneGenerationContext> {
  const summary = humanSceneSummary(options.scene, options.language)
  const textConstraint = humanSceneTextConstraint(options.scene, options.language)

  if (!textConstraint) return { textConstraint: '', summary }
  if (!options.includeReference) return { textConstraint, summary }

  try {
    const referenceBlob = await renderHumanSceneSketch(options.scene, options.aspect)

    return {
      textConstraint: humanSceneTextConstraint(options.scene, options.language, {
        includeControlGuidance: true,
      }),
      summary,
      referenceBlob,
    }
  } catch {
    return { textConstraint, summary }
  }
}
