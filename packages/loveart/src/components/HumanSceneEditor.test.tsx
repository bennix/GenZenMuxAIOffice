import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HumanSceneEditor from './HumanSceneEditor'
import { createDefaultHumanFigure, createDefaultHumanScene } from '../services/humanScene'
import { figureGeometry, polarPoint, stageSizeForAspect } from '../services/humanSceneGeometry'
import { useSettings } from '../store/settingsStore'
import type { HumanScene } from '../types'

function sceneWithPeople(count: number): HumanScene {
  return {
    ...createDefaultHumanScene('project-1', 'Scene 1', '16:9'),
    id: 'scene-1',
    people: Array.from({ length: count }, (_, index) => createDefaultHumanFigure(index)),
    createdAt: 1,
    updatedAt: 1,
  }
}

function StatefulEditor({
  initialScene,
  onScene,
}: {
  initialScene: HumanScene
  onScene: (scene: HumanScene) => void
}) {
  const [scene, setScene] = useState(initialScene)

  return (
    <HumanSceneEditor
      scene={scene}
      onChange={(nextScene) => {
        setScene(nextScene)
        onScene(nextScene)
      }}
    />
  )
}

function mockPreviewSvgRect(rect = { width: 1280, height: 720, left: 0, top: 0 }) {
  const svg = document.querySelector('svg')
  if (!svg) throw new Error('Expected human scene preview SVG')

  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }),
  })
}

function pointerEvent(type: string, init: { pointerId: number; clientX: number; clientY: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: init.pointerId },
    clientX: { configurable: true, value: init.clientX },
    clientY: { configurable: true, value: init.clientY },
  })

  return event
}

function viewBoxFor(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const [x, y, width, height] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number)

  return { x, y, width, height }
}

function stagePointToClientPoint(
  point: { x: number; y: number },
  viewBox: { x: number; y: number; width: number; height: number },
  rect = { width: 1280, height: 720, left: 0, top: 0 },
): { x: number; y: number } {
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height)
  const renderedWidth = viewBox.width * scale
  const renderedHeight = viewBox.height * scale
  const offsetX = (rect.width - renderedWidth) / 2
  const offsetY = (rect.height - renderedHeight) / 2

  return {
    x: rect.left + offsetX + (point.x - viewBox.x) * scale,
    y: rect.top + offsetY + (point.y - viewBox.y) * scale,
  }
}

describe('HumanSceneEditor', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    useSettings.setState({ lang: 'en' })
  })

  it('adds people until the four-person limit', () => {
    const onChange = vi.fn()
    render(<HumanSceneEditor scene={sceneWithPeople(3)} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))

    const nextScene = onChange.mock.calls[onChange.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people.map((person) => person.label)).toEqual([
      'Person A',
      'Person B',
      'Person C',
      'Person D',
    ])
  })

  it('disables the add button at four people with localized max text', () => {
    render(<HumanSceneEditor scene={sceneWithPeople(4)} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /max 4 people/i })).toBeDisabled()
  })

  it('updates the selected figure pose', () => {
    const onChange = vi.fn()
    render(<HumanSceneEditor scene={sceneWithPeople(1)} onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Pose' }), {
      target: { value: 'waving' },
    })

    const nextScene = onChange.mock.calls[onChange.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].posePreset).toBe('waving')
  })

  it('renders a taller pose preview editor', () => {
    render(<HumanSceneEditor scene={sceneWithPeople(1)} onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Scene 1 interactive preview' })).toHaveStyle({
      height: '260px',
    })
  })

  it('manually updates the selected figure position', () => {
    const onScene = vi.fn()
    render(<StatefulEditor initialScene={sceneWithPeople(1)} onScene={onScene} />)

    fireEvent.change(screen.getByRole('slider', { name: 'Position X' }), {
      target: { value: '42' },
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Position Y' }), {
      target: { value: '58' },
    })

    const nextScene = onScene.mock.calls[onScene.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].x).toBe(42)
    expect(nextScene.people[0].y).toBe(58)
  })

  it('manually updates the selected figure joint angles', () => {
    const onScene = vi.fn()
    render(<StatefulEditor initialScene={sceneWithPeople(1)} onScene={onScene} />)

    fireEvent.change(screen.getByRole('slider', { name: 'Right arm' }), {
      target: { value: '-72' },
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Torso' }), {
      target: { value: '18' },
    })

    const nextScene = onScene.mock.calls[onScene.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].joints.rightArm).toBe(-72)
    expect(nextScene.people[0].joints.torso).toBe(18)
  })

  it('updates position sliders after dragging the selected body in the preview', () => {
    const onScene = vi.fn()
    const initialScene = sceneWithPeople(1)
    const geometry = figureGeometry(
      initialScene.people[0],
      initialScene.people,
      initialScene.stage.aspect,
    )
    const { height } = stageSizeForAspect(initialScene.stage.aspect)
    const floorTop = height * 0.22
    const stageBottom = height * 0.9
    const targetPoint = {
      x: 1280 * 0.5,
      y: floorTop + (stageBottom - floorTop) * 0.4,
    }
    render(<StatefulEditor initialScene={initialScene} onScene={onScene} />)
    mockPreviewSvgRect()

    fireEvent(
      screen.getByRole('button', { name: 'Select Person A body handle' }),
      pointerEvent('pointerdown', {
        pointerId: 1,
        clientX: geometry.base.x,
        clientY: geometry.base.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointermove', {
        pointerId: 1,
        clientX: targetPoint.x,
        clientY: targetPoint.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointerup', {
        pointerId: 1,
        clientX: targetPoint.x,
        clientY: targetPoint.y,
      }),
    )

    const nextScene = onScene.mock.calls[onScene.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].x).toBe(50)
    expect(nextScene.people[0].y).toBe(40)
    expect(screen.getByRole('slider', { name: 'Position X' })).toHaveValue('50')
    expect(screen.getByRole('slider', { name: 'Position Y' })).toHaveValue('40')
  })

  it('updates the right arm slider after dragging the right arm handle in the preview', () => {
    const onScene = vi.fn()
    const initialScene = sceneWithPeople(1)
    const geometry = figureGeometry(
      initialScene.people[0],
      initialScene.people,
      initialScene.stage.aspect,
    )
    const targetPoint = polarPoint(
      geometry.rightShoulder.x,
      geometry.rightShoulder.y,
      geometry.armLength,
      72,
    )
    render(<StatefulEditor initialScene={initialScene} onScene={onScene} />)
    mockPreviewSvgRect()

    fireEvent(
      screen.getByRole('button', { name: 'Select Person A rightArm handle' }),
      pointerEvent('pointerdown', {
        pointerId: 2,
        clientX: geometry.rightHand.x,
        clientY: geometry.rightHand.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointermove', {
        pointerId: 2,
        clientX: targetPoint.x,
        clientY: targetPoint.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointerup', {
        pointerId: 2,
        clientX: targetPoint.x,
        clientY: targetPoint.y,
      }),
    )

    const nextScene = onScene.mock.calls[onScene.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].joints.rightArm).toBe(54)
    expect(screen.getByRole('slider', { name: 'Right arm' })).toHaveValue('54')
  })

  it('updates the right elbow slider after dragging the right elbow handle in the preview', () => {
    const onScene = vi.fn()
    const initialScene = sceneWithPeople(1)
    const geometry = figureGeometry(
      initialScene.people[0],
      initialScene.people,
      initialScene.stage.aspect,
    )
    const targetPoint = polarPoint(geometry.rightShoulder.x, geometry.rightShoulder.y, 38, 60)
    render(<StatefulEditor initialScene={initialScene} onScene={onScene} />)
    mockPreviewSvgRect()

    fireEvent(
      screen.getByRole('button', { name: 'Select Person A rightElbow handle' }),
      pointerEvent('pointerdown', {
        pointerId: 22,
        clientX: geometry.rightElbow.x,
        clientY: geometry.rightElbow.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointermove', {
        pointerId: 22,
        clientX: targetPoint.x,
        clientY: targetPoint.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointerup', {
        pointerId: 22,
        clientX: targetPoint.x,
        clientY: targetPoint.y,
      }),
    )

    const nextScene = onScene.mock.calls[onScene.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].joints.rightElbow).toBe(60)
    expect(screen.getByRole('slider', { name: 'Right elbow bend' })).toHaveValue('60')
  })

  it('keeps body drag coordinates correct when the SVG is letterboxed', () => {
    const onScene = vi.fn()
    const initialScene = sceneWithPeople(1)
    const geometry = figureGeometry(
      initialScene.people[0],
      initialScene.people,
      initialScene.stage.aspect,
    )
    const scale = 1000 / 1280
    const offsetY = (1000 - 720 * scale) / 2
    const { height } = stageSizeForAspect(initialScene.stage.aspect)
    const floorTop = height * 0.22
    const stageBottom = height * 0.9
    const targetStagePoint = { x: 640, y: floorTop + (stageBottom - floorTop) * 0.4 }
    render(<StatefulEditor initialScene={initialScene} onScene={onScene} />)
    mockPreviewSvgRect({ width: 1000, height: 1000, left: 10, top: 20 })

    fireEvent(
      screen.getByRole('button', { name: 'Select Person A body handle' }),
      pointerEvent('pointerdown', {
        pointerId: 11,
        clientX: 10 + geometry.base.x * scale,
        clientY: 20 + offsetY + geometry.base.y * scale,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointermove', {
        pointerId: 11,
        clientX: 10 + targetStagePoint.x * scale,
        clientY: 20 + offsetY + targetStagePoint.y * scale,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointerup', {
        pointerId: 11,
        clientX: 10 + targetStagePoint.x * scale,
        clientY: 20 + offsetY + targetStagePoint.y * scale,
      }),
    )

    const nextScene = onScene.mock.calls[onScene.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].x).toBe(50)
    expect(nextScene.people[0].y).toBe(40)
  })

  it('updates position sliders after dragging while the preview is zoomed', () => {
    const onScene = vi.fn()
    const initialScene = sceneWithPeople(1)
    const geometry = figureGeometry(
      initialScene.people[0],
      initialScene.people,
      initialScene.stage.aspect,
    )
    const { height } = stageSizeForAspect(initialScene.stage.aspect)
    const floorTop = height * 0.22
    const stageBottom = height * 0.9
    const targetPoint = {
      x: 1280 * 0.5,
      y: floorTop + (stageBottom - floorTop) * 0.4,
    }
    render(<StatefulEditor initialScene={initialScene} onScene={onScene} />)
    mockPreviewSvgRect()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in preview' }))
    const svg = document.querySelector('svg') as SVGSVGElement | null
    if (!svg) throw new Error('Expected human scene preview SVG')
    const zoomedViewBox = viewBoxFor(svg)
    const startClient = stagePointToClientPoint(geometry.base, zoomedViewBox)
    const targetClient = stagePointToClientPoint(targetPoint, zoomedViewBox)

    fireEvent(
      screen.getByRole('button', { name: 'Select Person A body handle' }),
      pointerEvent('pointerdown', {
        pointerId: 13,
        clientX: startClient.x,
        clientY: startClient.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointermove', {
        pointerId: 13,
        clientX: targetClient.x,
        clientY: targetClient.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointerup', {
        pointerId: 13,
        clientX: targetClient.x,
        clientY: targetClient.y,
      }),
    )

    const nextScene = onScene.mock.calls[onScene.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people[0].x).toBe(50)
    expect(nextScene.people[0].y).toBe(40)
    expect(screen.getByRole('slider', { name: 'Position X' })).toHaveValue('50')
    expect(screen.getByRole('slider', { name: 'Position Y' })).toHaveValue('40')
  })

  it('stops dragging on pointer cancel', () => {
    const onScene = vi.fn()
    const initialScene = sceneWithPeople(1)
    const geometry = figureGeometry(
      initialScene.people[0],
      initialScene.people,
      initialScene.stage.aspect,
    )
    render(<StatefulEditor initialScene={initialScene} onScene={onScene} />)
    mockPreviewSvgRect()

    fireEvent(
      screen.getByRole('button', { name: 'Select Person A body handle' }),
      pointerEvent('pointerdown', {
        pointerId: 12,
        clientX: geometry.base.x,
        clientY: geometry.base.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointercancel', {
        pointerId: 12,
        clientX: geometry.base.x,
        clientY: geometry.base.y,
      }),
    )
    fireEvent(
      window,
      pointerEvent('pointermove', {
        pointerId: 12,
        clientX: 640,
        clientY: 300,
      }),
    )

    expect(onScene).not.toHaveBeenCalled()
    expect(screen.getByRole('slider', { name: 'Position X' })).toHaveValue('30')
    expect(screen.getByRole('slider', { name: 'Position Y' })).toHaveValue('68')
  })

  it('selects a person through the interactive preview and shows that person controls', () => {
    render(<StatefulEditor initialScene={sceneWithPeople(2)} onScene={vi.fn()} />)
    mockPreviewSvgRect()

    fireEvent(
      screen.getByRole('button', { name: 'Select Person B body handle' }),
      pointerEvent('pointerdown', { pointerId: 3, clientX: 0, clientY: 0 }),
    )

    expect(screen.getByRole('button', { name: 'Person B' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: 'Position X' })).toHaveValue('42')
  })

  it('removes the selected person and clears references to that person', () => {
    const onChange = vi.fn()
    const initialScene = sceneWithPeople(2)
    initialScene.people[0] = {
      ...initialScene.people[0],
      facing: 'toward-person',
      facingTargetId: 'person-2',
    }
    render(<HumanSceneEditor scene={initialScene} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Person B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove person' }))

    const nextScene = onChange.mock.calls[onChange.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people).toHaveLength(1)
    expect(nextScene.people[0].id).toBe('person-1')
    expect(nextScene.people[0].facing).toBe('front')
    expect(nextScene.people[0].facingTargetId).toBeUndefined()
  })

  it('keeps editing the selected person by id when earlier people are removed', () => {
    const onChange = vi.fn()
    const initialScene = sceneWithPeople(3)
    const { rerender } = render(<HumanSceneEditor scene={initialScene} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Person B' }))

    rerender(
      <HumanSceneEditor
        scene={{ ...initialScene, people: [initialScene.people[1], initialScene.people[2]] }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Pose' }), {
      target: { value: 'waving' },
    })

    const nextScene = onChange.mock.calls[onChange.mock.calls.length - 1][0] as HumanScene
    expect(nextScene.people.find((person) => person.id === 'person-2')?.posePreset).toBe('waving')
    expect(nextScene.people.find((person) => person.id === 'person-3')?.posePreset).toBe('standing')
  })
})
