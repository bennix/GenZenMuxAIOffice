import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HumanScenePicker from './HumanScenePicker'
import { createDefaultHumanScene } from '../services/humanScene'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'

describe('HumanScenePicker', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    useSettings.setState({ lang: 'en' })
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  })

  it('creates and selects a scene', () => {
    let selected: string | null = null
    const onChange = vi.fn((sceneId: string | null) => {
      selected = sceneId
    })

    render(
      <HumanScenePicker
        projectId="project-1"
        aspect="16:9"
        value={null}
        useReference={false}
        onChange={onChange}
        onUseReferenceChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'New human scene' }))

    const scenes = useCanvas.getState().humanScenes
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('Human Scene 1')
    expect(onChange).toHaveBeenCalledWith(scenes[0].id)
    expect(selected).toBe(scenes[0].id)
  })

  it('calls onUseReferenceChange when sketch reference is checked', () => {
    const sceneId = useCanvas
      .getState()
      .addHumanScene(createDefaultHumanScene('project-1', 'Scene 1', '16:9'))
    const onUseReferenceChange = vi.fn()

    render(
      <HumanScenePicker
        projectId="project-1"
        aspect="16:9"
        value={sceneId}
        useReference={false}
        onChange={vi.fn()}
        onUseReferenceChange={onUseReferenceChange}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Use sketch reference' }))

    expect(onUseReferenceChange).toHaveBeenCalledWith(true)
  })
})
