import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AssetCard from './AssetCard'
import type { Card } from '../types'
import { createDefaultHumanFigure } from '../services/humanScene'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'

describe('AssetCard', () => {
  it.each([
    ['openai/gpt-image-2.5-flare', 'GPT Image 2.5 Flare'],
    ['openai/gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst'],
  ])(
    'shows the selector name for recorded model %s regardless of the current default',
    (model, name) => {
      useSettings.setState({
        models: [
          { id: model, name, category: 'image' },
          { id: 'openai/gpt-image-2', name: 'GPT Image 2', category: 'image', isDefault: true },
        ],
      })
      const card: Card = {
        id: 'model-card',
        projectId: 'p',
        type: 'image',
        status: 'ready',
        model,
        x: 0,
        y: 0,
        w: 320,
        h: 320,
      }
      render(<AssetCard card={card} scale={1} />)
      expect(screen.getByText(name)).toHaveAttribute('title', model)
      expect(screen.getByText(name)).toHaveStyle({ overflowWrap: 'anywhere' })
    },
  )
  beforeEach(() => {
    useSettings.setState({ lang: 'en' })
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  })

  afterEach(() => {
    cleanup()
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  })

  it('renders ready videos without cropping the frame', () => {
    const card: Card = {
      id: 'video-1',
      projectId: 'project-1',
      type: 'video',
      status: 'ready',
      url: 'https://example.com/video.mp4',
      prompt: 'Preserve reference text',
      model: 'bytedance/doubao-seedance-2.0',
      x: 0,
      y: 0,
      w: 400,
      h: 240,
    }

    render(<AssetCard card={card} scale={1} />)

    expect(screen.getByTitle('Download').closest('.rise')?.querySelector('video')).toHaveStyle({
      objectFit: 'contain',
    })
  })

  it('lets video controls receive pointer events without capturing or dragging the card', () => {
    const card: Card = {
      id: 'v',
      projectId: 'p',
      type: 'video',
      status: 'ready',
      url: '/video.mp4',
      x: 10,
      y: 20,
      w: 400,
      h: 240,
    }
    const onPointerDown = vi.fn()
    const { container } = render(
      <div onPointerDown={onPointerDown}>
        <AssetCard card={card} scale={1} />
      </div>,
    )
    const root = container.querySelector('.rise') as HTMLElement
    const capture = vi.fn()
    root.setPointerCapture = capture
    const video = container.querySelector('video')!
    fireEvent.pointerDown(video, { pointerId: 1, clientX: 40, clientY: 40 })
    expect(capture).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('playsinline')
    fireEvent.pointerDown(root, { pointerId: 2 })
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('does not render a branch handle for ready videos', () => {
    const card: Card = {
      id: 'video-1',
      projectId: 'project-1',
      type: 'video',
      status: 'ready',
      url: 'https://example.com/video.mp4',
      prompt: 'Preserve reference text',
      model: 'bytedance/doubao-seedance-2.0',
      x: 0,
      y: 0,
      w: 400,
      h: 240,
    }

    render(<AssetCard card={card} scale={1} onBranchStart={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Branch from this card' })).not.toBeInTheDocument()
  })

  it('calls branch start with the card and pointer event from the branch handle', () => {
    const card: Card = {
      id: 'image-1',
      projectId: 'project-1',
      type: 'image',
      status: 'ready',
      url: 'https://example.com/image.png',
      prompt: 'Branch from this',
      model: 'openai/gpt-image-2',
      x: 0,
      y: 0,
      w: 320,
      h: 320,
    }
    const onBranchStart = vi.fn()

    render(<AssetCard card={card} scale={1} onBranchStart={onBranchStart} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Branch from this card' }), {
      pointerId: 7,
      clientX: 310,
      clientY: 160,
    })

    expect(onBranchStart).toHaveBeenCalledTimes(1)
    expect(onBranchStart.mock.calls[0][0]).toBe(card)
    expect(onBranchStart.mock.calls[0][1]).toMatchObject({ type: 'pointerdown' })
    expect(onBranchStart.mock.calls[0][1].preventDefault).toEqual(expect.any(Function))
  })

  it('renders the branch handle as an accent pill', () => {
    const card: Card = {
      id: 'image-1',
      projectId: 'project-1',
      type: 'image',
      status: 'ready',
      url: 'https://example.com/image.png',
      prompt: 'Branch from this',
      model: 'openai/gpt-image-2',
      x: 0,
      y: 0,
      w: 320,
      h: 320,
    }

    render(<AssetCard card={card} scale={1} onBranchStart={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Branch from this card' })).toHaveStyle({
      background: 'var(--accent-grad)',
      color: '#fff',
      width: '34px',
    })
  })

  it('localizes the branch handle label from settings language', () => {
    useSettings.setState({ lang: 'zh' })
    const card: Card = {
      id: 'image-1',
      projectId: 'project-1',
      type: 'image',
      status: 'ready',
      url: 'https://example.com/image.png',
      prompt: 'Branch from this',
      model: 'openai/gpt-image-2',
      x: 0,
      y: 0,
      w: 320,
      h: 320,
    }

    render(<AssetCard card={card} scale={1} onBranchStart={vi.fn()} />)

    expect(screen.getByRole('button', { name: '从这张卡片创建分支' })).toBeInTheDocument()
  })

  it('renders a ready human scene preview without a branch handle', () => {
    const sceneId = useCanvas.getState().addHumanScene({
      projectId: 'project-1',
      name: 'Blocking preview',
      stage: { aspect: '16:9', perspective: 'pseudo-3d' },
      people: [createDefaultHumanFigure(0)],
    })
    const card: Card = {
      id: 'human-scene-1',
      projectId: 'project-1',
      type: 'humanScene',
      status: 'ready',
      humanSceneId: sceneId,
      x: 0,
      y: 0,
      w: 320,
      h: 220,
    }

    render(<AssetCard card={card} scale={1} onBranchStart={vi.fn()} />)

    expect(screen.getAllByText('Blocking preview').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Blocking preview').length).toBeGreaterThan(0)
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Regenerate')).not.toBeInTheDocument()
    expect(screen.getByTitle('Duplicate')).toBeInTheDocument()
    expect(screen.getByTitle('Delete')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Branch from this card' })).not.toBeInTheDocument()
  })

  it('renders a missing human scene fallback without media-only actions', () => {
    const card: Card = {
      id: 'human-scene-missing',
      projectId: 'project-1',
      type: 'humanScene',
      status: 'ready',
      humanSceneId: 'missing-scene',
      x: 0,
      y: 0,
      w: 320,
      h: 220,
    }

    render(<AssetCard card={card} scale={1} onBranchStart={vi.fn()} />)

    expect(screen.getByText('Human scene unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Branch from this card' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Regenerate')).not.toBeInTheDocument()
    expect(screen.getByTitle('Duplicate')).toBeInTheDocument()
    expect(screen.getByTitle('Delete')).toBeInTheDocument()
  })
})
