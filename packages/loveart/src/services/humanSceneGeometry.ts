import type { HumanFigure, HumanFigureJoints, HumanSceneAspect } from '../types'

export interface Point {
  x: number
  y: number
}

export interface StageSize {
  width: number
  height: number
}

export interface FigureGeometry {
  base: Point
  hip: Point
  shoulder: Point
  head: Point
  leftShoulder: Point
  rightShoulder: Point
  leftHip: Point
  rightHip: Point
  leftElbow: Point
  rightElbow: Point
  leftHand: Point
  rightHand: Point
  leftKnee: Point
  rightKnee: Point
  leftFoot: Point
  rightFoot: Point
  headRadius: number
  color: string
  torsoLength: number
  shoulderWidth: number
  hipWidth: number
  armLength: number
  legLength: number
  scale: number
  eyeOffset: number
}

const COLORS: Record<HumanFigure['label'], string> = {
  'Person A': '#2563eb',
  'Person B': '#dc2626',
  'Person C': '#059669',
  'Person D': '#9333ea',
}

export const JOINT_LIMITS: Record<keyof HumanFigureJoints, { min: number; max: number }> = {
  head: { min: -45, max: 45 },
  torso: { min: -45, max: 45 },
  leftArm: { min: -120, max: 120 },
  rightArm: { min: -120, max: 120 },
  leftElbow: { min: -90, max: 120 },
  rightElbow: { min: -90, max: 120 },
  leftLeg: { min: -80, max: 80 },
  rightLeg: { min: -80, max: 80 },
  leftKnee: { min: -40, max: 120 },
  rightKnee: { min: -40, max: 120 },
}

export function stageSizeForAspect(aspect: HumanSceneAspect): StageSize {
  if (aspect === '9:16') return { width: 720, height: 1280 }
  if (aspect === '1:1') return { width: 1024, height: 1024 }
  return { width: 1280, height: 720 }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampAngle(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max))
}

export function polarPoint(x: number, y: number, length: number, degreesFromDown: number): Point {
  const radians = (degreesFromDown * Math.PI) / 180

  return {
    x: x + Math.sin(radians) * length,
    y: y + Math.cos(radians) * length,
  }
}

export function angleFromDown(origin: Point, endpoint: Point): number {
  const dx = endpoint.x - origin.x
  const dy = endpoint.y - origin.y

  return (Math.atan2(dx, dy) * 180) / Math.PI
}

export function pointToStagePercent(point: Point, aspect: HumanSceneAspect): Point {
  const { width, height } = stageSizeForAspect(aspect)
  const stageBottom = height * 0.9
  const floorTop = height * 0.22

  return {
    x: Math.round(clamp((point.x / width) * 100, 0, 100)),
    y: Math.round(clamp(((point.y - floorTop) / (stageBottom - floorTop)) * 100, 0, 100)),
  }
}

function facingOffset(person: HumanFigure, people: HumanFigure[]): number {
  if (person.facing === 'left') return -6
  if (person.facing === 'right') return 6
  if (person.facing === 'back') return 0
  if (person.facing === 'toward-person' && person.facingTargetId) {
    const target = people.find((candidate) => candidate.id === person.facingTargetId)
    if (target) return target.x > person.x ? 6 : -6
  }

  return 0
}

export function figureGeometry(
  person: HumanFigure,
  people: HumanFigure[],
  aspect: HumanSceneAspect,
): FigureGeometry {
  const { width, height } = stageSizeForAspect(aspect)
  const stageBottom = height * 0.9
  const floorTop = height * 0.22
  const baseX = (person.x / 100) * width
  const baseY = floorTop + (person.y / 100) * (stageBottom - floorTop)
  const depthScale = 0.72 + (1 - person.zDepth) * 0.34
  const scale = person.scale * depthScale * (Math.min(width, height) / 720)
  const headRadius = 18 * scale
  const torsoLength = 76 * scale
  const shoulderWidth = 52 * scale
  const hipWidth = 34 * scale
  const armLength = 62 * scale
  const legLength = person.posePreset === 'sitting' ? 44 * scale : 72 * scale
  const upperArmLength = armLength * 0.52
  const forearmLength = armLength * 0.52
  const upperLegLength = legLength * 0.52
  const lowerLegLength = legLength * 0.52
  const hipY = baseY - legLength
  const shoulderY = hipY - torsoLength
  const headY = shoulderY - headRadius * 1.55
  const bodyLean = Math.sin((person.joints.torso * Math.PI) / 180) * 18 * scale
  const shoulderX = baseX + bodyLean
  const hipX = baseX
  const base = { x: baseX, y: baseY }
  const hip = { x: hipX, y: hipY }
  const shoulder = { x: shoulderX, y: shoulderY }
  const head = {
    x: shoulderX + Math.sin((person.joints.head * Math.PI) / 180) * 8 * scale,
    y: headY,
  }
  const leftShoulder = { x: shoulderX - shoulderWidth / 2, y: shoulderY }
  const rightShoulder = { x: shoulderX + shoulderWidth / 2, y: shoulderY }
  const leftHip = { x: hipX - hipWidth / 2, y: hipY }
  const rightHip = { x: hipX + hipWidth / 2, y: hipY }
  const leftUpperArmAngle = -person.joints.leftArm - 18
  const rightUpperArmAngle = person.joints.rightArm + 18
  const leftUpperLegAngle = person.joints.leftLeg - 12
  const rightUpperLegAngle = person.joints.rightLeg + 12
  const leftElbow = polarPoint(leftShoulder.x, leftShoulder.y, upperArmLength, leftUpperArmAngle)
  const rightElbow = polarPoint(
    rightShoulder.x,
    rightShoulder.y,
    upperArmLength,
    rightUpperArmAngle,
  )
  const leftHand = polarPoint(
    leftElbow.x,
    leftElbow.y,
    forearmLength,
    leftUpperArmAngle - person.joints.leftElbow,
  )
  const rightHand = polarPoint(
    rightElbow.x,
    rightElbow.y,
    forearmLength,
    rightUpperArmAngle + person.joints.rightElbow,
  )
  const leftKnee = polarPoint(leftHip.x, leftHip.y, upperLegLength, leftUpperLegAngle)
  const rightKnee = polarPoint(rightHip.x, rightHip.y, upperLegLength, rightUpperLegAngle)
  const leftFoot = polarPoint(
    leftKnee.x,
    leftKnee.y,
    lowerLegLength,
    leftUpperLegAngle + person.joints.leftKnee,
  )
  const rightFoot = polarPoint(
    rightKnee.x,
    rightKnee.y,
    lowerLegLength,
    rightUpperLegAngle - person.joints.rightKnee,
  )

  return {
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
    color: COLORS[person.label],
    torsoLength,
    shoulderWidth,
    hipWidth,
    armLength,
    legLength,
    scale,
    eyeOffset: facingOffset(person, people) * scale,
  }
}
