import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEdges from './CanvasEdges'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'
import type { CanvasEdge } from '../types'

const { runBranchGeneration } = vi.hoisted(() => ({
  runBranchGeneration: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/branchGeneration', () => ({ runBranchGeneration }))
vi.mock('./SketchPad', () => ({
  default: ({ onAdd, onClose }: { onAdd: (blob: Blob) => void; onClose: () => void }) => (
    <button
      onClick={() => {
        onAdd(new Blob(['sketch'], { type: 'image/png' }))
        onClose()
      }}
    >
      Use as reference
    </button>
  ),
}))

const sourceCard = {
  id: 'source-1',
  projectId: 'project-1',
  type: 'image' as const,
  status: 'ready' as const,
  url: 'data:image/png;base64,source',
  prompt: 'source',
  x: 100,
  y: 120,
  w: 320,
  h: 320,
}

const draftEdge: CanvasEdge = {
  id: 'edge-1',
  projectId: 'project-1',
  sourceCardId: 'source-1',
  prompt: '',
  outputMode: 'image',
  useSourceAsReference: true,
  sourceAnchor: 'right',
  targetX: 560,
  targetY: 220,
  status: 'draft',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('CanvasEdges', () => {
  it('offers model-specific durations and preserves the selected branch duration', () => {
    useSettings.setState({
      models: [
        {
          id: 'bytedance/doubao-seedance-2.5',
          name: 'Seedance 2.5',
          category: 'video',
          isDefault: true,
        },
        { id: 'google/veo-3.1-generate-001', name: 'Veo 3.1', category: 'video' },
      ],
    })
    useCanvas.setState({ edges: [{ ...draftEdge, outputMode: 'video' }] })
    render(<CanvasEdges projectId="project-1" />)
    const select = screen.getByRole('combobox', { name: 'Length' })
    expect(within(select).getAllByRole('option')).toHaveLength(27)
    fireEvent.change(select, { target: { value: '30' } })
    expect(useCanvas.getState().edges[0].duration).toBe(30)
    fireEvent.change(screen.getByTitle('video model'), {
      target: { value: 'google/veo-3.1-generate-001' },
    })
    expect(select).toHaveValue('8')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['4s', '6s', '8s'])
  })
  beforeEach(() => {
    vi.clearAllMocks()
    URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`)
    URL.revokeObjectURL = vi.fn()
    useSettings.setState({
      lang: 'en',
      models: [
        { id: 'openai/custom-image', name: 'Custom Image', category: 'image', isDefault: true },
        { id: 'openai/alt-image', name: 'Alt Image', category: 'image' },
        { id: 'bytedance/custom-video', name: 'Custom Video', category: 'video', isDefault: true },
        { id: 'google/alt-video', name: 'Alt Video', category: 'video' },
        { id: 'anthropic/custom-chat', name: 'Custom Chat', category: 'chat', isDefault: true },
      ],
    })
    useCanvas.setState({ cards: [sourceCard], edges: [draftEdge], humanScenes: [], viewports: {} })
  })

  afterEach(() => {
    cleanup()
  })

  it('updates draft prompt, output mode, and source reference toggle', () => {
    render(<CanvasEdges projectId="project-1" />)

    const prompt = screen.getByRole('textbox', { name: 'Describe the branch edit' })
    expect(prompt.closest('.branch-editor')).not.toBeNull()

    fireEvent.change(prompt, {
      target: { value: 'make it cinematic' },
    })
    fireEvent.change(screen.getByTitle('image model'), {
      target: { value: 'openai/alt-image' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    fireEvent.change(screen.getByTitle('video model'), {
      target: { value: 'google/alt-video' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use source as reference' }))

    expect(useCanvas.getState().edges[0]).toMatchObject({
      prompt: 'make it cinematic',
      outputMode: 'video',
      model: 'google/alt-video',
      useSourceAsReference: false,
    })
  })

  it('submits uploaded, pasted and Sketch references with only their own branch', () => {
    const { container } = render(<CanvasEdges projectId="project-1" />)
    const upload = new File(['upload'], 'upload.png', { type: 'image/png' })
    const pasted = new File(['paste'], 'paste.png', { type: 'image/png' })
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [upload] },
    })
    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { items: [{ type: 'image/png', getAsFile: () => pasted }] },
    })
    fireEvent.click(screen.getByRole('button', { name: '✎ Sketch pad' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use as reference' }))
    expect(screen.getByRole('img', { name: 'Sketch' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove reference' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Generate branch' }))
    expect(runBranchGeneration).toHaveBeenCalledWith('project-1', 'edge-1', [
      expect.objectContaining({ blob: pasted }),
      expect.objectContaining({ blob: expect.any(Blob), kind: 'sketch' }),
    ])
  })

  it('shows Human Scene picker for video branch drafts', () => {
    useCanvas.setState({
      cards: [sourceCard],
      edges: [{ ...draftEdge, outputMode: 'video', humanSceneId: null }],
      humanScenes: [],
      viewports: {},
    })

    render(<CanvasEdges projectId="project-1" />)

    const picker = screen.getByRole('combobox', { name: 'Human Scene' })
    expect(picker).toBeInTheDocument()
    expect(picker.closest('.branch-editor')).toHaveStyle({ width: '760px' })
  })

  it('creates and edits a Human Scene from a video branch draft', () => {
    useCanvas.setState({
      cards: [sourceCard],
      edges: [{ ...draftEdge, outputMode: 'video', humanSceneId: null }],
      humanScenes: [],
      viewports: {},
    })

    render(<CanvasEdges projectId="project-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'New human scene' }))
    const sceneId = useCanvas.getState().humanScenes[0].id
    fireEvent.change(screen.getByRole('slider', { name: 'Right elbow bend' }), {
      target: { value: '60' },
    })

    expect(useCanvas.getState().edges[0].humanSceneId).toBe(sceneId)
    expect(useCanvas.getState().humanScenes[0].people[0].joints.rightElbow).toBe(60)
  })

  it('does not show Human Scene picker for image branch drafts', () => {
    render(<CanvasEdges projectId="project-1" />)

    expect(screen.queryByRole('combobox', { name: 'Human Scene' })).not.toBeInTheDocument()
  })

  it('clears Human Scene fields when switching a video branch to image', () => {
    useCanvas.setState({
      cards: [sourceCard],
      edges: [
        {
          ...draftEdge,
          outputMode: 'video',
          humanSceneId: 'scene-1',
          useHumanSceneReference: true,
        },
      ],
      humanScenes: [
        {
          id: 'scene-1',
          projectId: 'project-1',
          name: 'Blocking',
          stage: { aspect: '16:9', perspective: 'pseudo-3d' },
          people: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      viewports: {},
    })
    render(<CanvasEdges projectId="project-1" />)

    expect(screen.getByRole('combobox', { name: 'Human Scene' })).toHaveValue('scene-1')
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))

    expect(useCanvas.getState().edges[0]).toMatchObject({
      outputMode: 'image',
      humanSceneId: null,
      useHumanSceneReference: false,
    })
  })

  it('creates a generating target card, attaches it to the edge, and starts branch generation', async () => {
    render(<CanvasEdges projectId="project-1" />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Describe the branch edit' }), {
      target: { value: 'extend into a vertical poster' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate branch' }))

    await waitFor(() => {
      expect(runBranchGeneration).toHaveBeenCalledWith('project-1', 'edge-1')
    })

    const cards = useCanvas.getState().cards
    const target = cards.find((card) => card.id !== 'source-1')
    expect(target).toMatchObject({
      projectId: 'project-1',
      type: 'video',
      status: 'generating',
      model: 'bytedance/custom-video',
      prompt: 'extend into a vertical poster',
      x: 560,
      y: 220,
      w: 400,
      h: 240,
    })
    expect(useCanvas.getState().edges[0]).toMatchObject({
      targetCardId: target?.id,
      status: 'generating',
    })
  })

  it('ignores duplicate generate clicks while a branch is already starting', async () => {
    const pending = deferred<void>()
    runBranchGeneration.mockReturnValueOnce(pending.promise)

    render(<CanvasEdges projectId="project-1" />)

    const generate = screen.getByRole('button', { name: 'Generate branch' })
    fireEvent.click(generate)
    fireEvent.click(generate)

    expect(runBranchGeneration).toHaveBeenCalledTimes(1)
    expect(useCanvas.getState().cards.filter((card) => card.id !== 'source-1')).toHaveLength(1)
    expect(useCanvas.getState().edges[0]).toMatchObject({ status: 'generating' })

    pending.resolve()
  })
})
