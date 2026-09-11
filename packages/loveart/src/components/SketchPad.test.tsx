import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SketchPad from './SketchPad'
import { useSettings } from '../store/settingsStore'

beforeEach(() => {
  useSettings.setState({ lang: 'en' })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['png'], { type: 'image/png' })),
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('exports drawn strokes as PNG, supports undo/redo, and prevents empty submission', async () => {
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(<SketchPad open onAdd={onAdd} onClose={onClose} />)
  const area = screen.getByLabelText('Sketch drawing area')
  area.setPointerCapture = vi.fn()
  expect(screen.getByText('Use as reference')).toBeDisabled()
  const down = new Event('pointerdown', { bubbles: true })
  Object.assign(down, { button: 0, pointerId: 1, clientX: 20, clientY: 30 })
  vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 512,
    height: 288,
  } as DOMRect)
  const up = new Event('pointerup', { bubbles: true })
  Object.assign(up, { pointerId: 1 })
  fireEvent(area, down)
  fireEvent(area, up)
  expect(screen.getByText('Use as reference')).toBeEnabled()
  fireEvent.click(screen.getByText('Undo'))
  expect(screen.getByText('Use as reference')).toBeDisabled()
  fireEvent.click(screen.getByText('Redo'))
  fireEvent.click(screen.getByText('Use as reference'))
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' })),
  )
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('closes with Escape without submitting a reference', () => {
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(<SketchPad open onAdd={onAdd} onClose={onClose} />)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onAdd).not.toHaveBeenCalled()
})
