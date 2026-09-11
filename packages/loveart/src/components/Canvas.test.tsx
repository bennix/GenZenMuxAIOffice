import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Canvas from './Canvas'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'

vi.mock('../services/branchGeneration', () => ({
  runBranchGeneration: vi.fn(async () => undefined),
}))

describe('Canvas branch interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    useSettings.setState({ lang: 'en' })
    useCanvas.setState({ cards: [], edges: [], viewports: {} })
  })

  it('creates a branch edge by dragging from a card handle', () => {
    useCanvas.getState().addCard({
      projectId: 'project-1',
      type: 'image',
      status: 'ready',
      prompt: 'Source prompt',
      url: 'data:image/png;base64,source',
      x: 100,
      y: 100,
      w: 320,
      h: 320,
    })

    render(<Canvas projectId="project-1" />)

    const handle = screen.getByTitle('Branch from this card')
    fireEvent.pointerDown(handle, { clientX: 430, clientY: 260, pointerId: 1 })
    fireEvent.pointerMove(screen.getByTestId('canvas-root'), {
      clientX: 620,
      clientY: 300,
      pointerId: 1,
    })
    fireEvent.pointerUp(screen.getByTestId('canvas-root'), {
      clientX: 620,
      clientY: 300,
      pointerId: 1,
    })

    expect(useCanvas.getState().edges).toHaveLength(1)
    expect(screen.getByPlaceholderText('Describe the branch edit')).toBeInTheDocument()
  })
})
