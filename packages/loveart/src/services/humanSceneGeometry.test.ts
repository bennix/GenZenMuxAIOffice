import { describe, expect, it } from 'vitest'
import { createDefaultHumanFigure } from './humanScene'
import {
  angleFromDown,
  clampAngle,
  figureGeometry,
  pointToStagePercent,
  stageSizeForAspect,
} from './humanSceneGeometry'

describe('humanSceneGeometry', () => {
  it('returns stable stage sizes for supported aspects', () => {
    expect(stageSizeForAspect('16:9')).toEqual({ width: 1280, height: 720 })
    expect(stageSizeForAspect('9:16')).toEqual({ width: 720, height: 1280 })
    expect(stageSizeForAspect('1:1')).toEqual({ width: 1024, height: 1024 })
  })

  it('computes stable default figure points', () => {
    const person = createDefaultHumanFigure(0)
    const points = figureGeometry(person, [person], '16:9')

    expect(points.base.x).toBeCloseTo(384, 1)
    expect(points.base.y).toBeCloseTo(491.3, 1)
    expect(points.head.x).toBeCloseTo(384, 1)
    expect(points.leftHand.x).toBeLessThan(points.leftShoulder.x)
    expect(points.rightHand.x).toBeGreaterThan(points.rightShoulder.x)
    expect(points.leftElbow.x).toBeLessThan(points.leftShoulder.x)
    expect(points.leftElbow.x).toBeGreaterThan(points.leftHand.x)
    expect(points.rightKnee.y).toBeGreaterThan(points.rightHip.y)
    expect(points.rightKnee.y).toBeLessThan(points.rightFoot.y)
  })

  it('maps a pointer point back to clamped stage percentages', () => {
    expect(pointToStagePercent({ x: 640, y: 403.2 }, '16:9')).toEqual({ x: 50, y: 50 })
    expect(pointToStagePercent({ x: -100, y: 2000 }, '16:9')).toEqual({ x: 0, y: 100 })
  })

  it('converts endpoint vectors to clamped joint angles', () => {
    expect(Math.round(angleFromDown({ x: 0, y: 0 }, { x: 10, y: 10 }))).toBe(45)
    expect(clampAngle(200, -120, 120)).toBe(120)
    expect(clampAngle(-200, -80, 80)).toBe(-80)
  })
})
