import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HumanSceneInteractivePreview from './HumanSceneInteractivePreview'
import { createDefaultHumanFigure, createDefaultHumanScene } from '../services/humanScene'
import type { HumanScene } from '../types'
import type { HumanSceneViewport } from './HumanSceneInteractivePreview'

function twoPersonScene(): HumanScene {
  return {
    ...createDefaultHumanScene('project-1', 'Blocking sketch', '16:9'),
    id: 'scene-1',
    people: [createDefaultHumanFigure(0), createDefaultHumanFigure(1)],
    createdAt: 1,
    updatedAt: 1,
  }
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

describe('HumanSceneInteractivePreview', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders selectable people and joint handles', () => {
    render(<HumanSceneInteractivePreview scene={twoPersonScene()} />)

    expect(screen.getByRole('group', { name: 'Blocking sketch interactive preview' })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Select Person A' })).toHaveAttribute(
      'data-person-id',
      'person-1',
    )
    expect(screen.getByRole('button', { name: 'Select Person B' })).toHaveAttribute(
      'data-person-id',
      'person-2',
    )
    expect(screen.getByRole('button', { name: 'Select Person A rightArm handle' })).toHaveAttribute(
      'data-joint',
      'rightArm',
    )
    expect(
      screen.getByRole('button', { name: 'Select Person A rightElbow handle' }),
    ).toHaveAttribute('data-joint', 'rightElbow')
    expect(
      screen.getByRole('button', { name: 'Select Person A rightKnee handle' }),
    ).toHaveAttribute('data-joint', 'rightKnee')
  })

  it('selects and starts body drag on pointer down', () => {
    const onSelectPerson = vi.fn()
    const onDragStart = vi.fn()
    render(
      <HumanSceneInteractivePreview
        scene={twoPersonScene()}
        onSelectPerson={onSelectPerson}
        onDragStart={onDragStart}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Select Person B body handle' }))

    expect(onSelectPerson).toHaveBeenCalledWith('person-2')
    expect(onDragStart).toHaveBeenCalledWith(
      { kind: 'body', personId: 'person-2' },
      expect.objectContaining({ type: 'pointerdown' }),
    )
  })

  it('selects and starts joint drag on pointer down', () => {
    const onSelectPerson = vi.fn()
    const onDragStart = vi.fn()
    render(
      <HumanSceneInteractivePreview
        scene={twoPersonScene()}
        onSelectPerson={onSelectPerson}
        onDragStart={onDragStart}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Select Person A rightArm handle' }))

    expect(onSelectPerson).toHaveBeenCalledWith('person-1')
    expect(onDragStart).toHaveBeenCalledWith(
      { kind: 'joint', personId: 'person-1', joint: 'rightArm' },
      expect.objectContaining({ type: 'pointerdown' }),
    )
  })

  it('marks the selected person', () => {
    render(<HumanSceneInteractivePreview scene={twoPersonScene()} selectedPersonId="person-2" />)

    expect(screen.getByTestId('human-scene-person-person-2')).toHaveAttribute(
      'data-selected',
      'true',
    )
    expect(screen.getByTestId('human-scene-person-person-1')).toHaveAttribute(
      'data-selected',
      'false',
    )
  })

  it('selects a focused handle from the keyboard without starting drag', () => {
    const onSelectPerson = vi.fn()
    const onDragStart = vi.fn()
    render(
      <HumanSceneInteractivePreview
        scene={twoPersonScene()}
        onSelectPerson={onSelectPerson}
        onDragStart={onDragStart}
      />,
    )

    const handle = screen.getByRole('button', { name: 'Select Person A rightArm handle' })
    fireEvent.keyDown(handle, { key: 'Enter' })
    fireEvent.keyDown(handle, { key: ' ' })

    expect(onSelectPerson).toHaveBeenCalledTimes(2)
    expect(onSelectPerson).toHaveBeenNthCalledWith(1, 'person-1')
    expect(onSelectPerson).toHaveBeenNthCalledWith(2, 'person-1')
    expect(onDragStart).not.toHaveBeenCalled()
  })

  it('marks focused handles and opts out of browser touch gestures', () => {
    render(<HumanSceneInteractivePreview scene={twoPersonScene()} />)

    const preview = screen.getByRole('group', { name: 'Blocking sketch interactive preview' })
    const handle = screen.getByRole('button', { name: 'Select Person A rightArm handle' })
    expect(preview).toHaveAttribute('data-touch-action', 'none')
    expect(handle).toHaveAttribute('data-touch-action', 'none')

    fireEvent.focus(handle)
    expect(handle).toHaveAttribute('data-focused', 'true')

    fireEvent.blur(handle)
    expect(handle).toHaveAttribute('data-focused', 'false')
  })

  it('captures pointer streams when the handle supports pointer capture', () => {
    const onDragStart = vi.fn()
    render(<HumanSceneInteractivePreview scene={twoPersonScene()} onDragStart={onDragStart} />)

    const handle = screen.getByRole('button', { name: 'Select Person B body handle' })
    const setPointerCapture = vi.fn()
    Object.defineProperty(handle, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    })

    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true })
    Object.defineProperty(pointerDown, 'pointerId', {
      configurable: true,
      value: 7,
    })
    fireEvent(handle, pointerDown)

    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(onDragStart).toHaveBeenCalledWith(
      { kind: 'body', personId: 'person-2' },
      expect.objectContaining({ type: 'pointerdown' }),
    )
  })

  it('zooms and resets the preview view without changing scene data', () => {
    function ControlledPreview() {
      const [viewport, setViewport] = useState<HumanSceneViewport>({
        zoom: 1,
        panX: 0,
        panY: 0,
      })

      return (
        <HumanSceneInteractivePreview
          scene={twoPersonScene()}
          viewport={viewport}
          onViewportChange={setViewport}
        />
      )
    }

    const { container } = render(<ControlledPreview />)
    const svg = container.querySelector('svg')
    if (!svg) throw new Error('Missing preview SVG')

    expect(svg.getAttribute('viewBox')).toBe('0 0 1280 720')

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in preview' }))
    expect(svg.getAttribute('viewBox')).not.toBe('0 0 1280 720')

    fireEvent.click(screen.getByRole('button', { name: 'Reset preview view' }))
    expect(svg.getAttribute('viewBox')).toBe('0 0 1280 720')
  })

  it('pans the preview view by dragging the background surface', () => {
    function ControlledPreview() {
      const [viewport, setViewport] = useState<HumanSceneViewport>({
        zoom: 1,
        panX: 0,
        panY: 0,
      })

      return (
        <HumanSceneInteractivePreview
          scene={twoPersonScene()}
          viewport={viewport}
          onViewportChange={setViewport}
        />
      )
    }

    const { container } = render(<ControlledPreview />)
    const svg = container.querySelector('svg')
    if (!svg) throw new Error('Missing preview SVG')
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1280,
        bottom: 720,
        width: 1280,
        height: 720,
        toJSON: () => ({}),
      }),
    })

    fireEvent(
      screen.getByTestId('human-scene-preview-pan-surface'),
      pointerEvent('pointerdown', { pointerId: 21, clientX: 640, clientY: 360 }),
    )
    fireEvent(window, pointerEvent('pointermove', { pointerId: 21, clientX: 740, clientY: 360 }))
    fireEvent(window, pointerEvent('pointerup', { pointerId: 21, clientX: 740, clientY: 360 }))

    expect(svg.getAttribute('viewBox')).toBe('-100 0 1280 720')
  })
})
