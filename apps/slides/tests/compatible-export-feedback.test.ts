import { expect, it, vi } from 'vitest'
import type { ActionCtx } from '../src/renderer/action-context'
vi.mock('../src/renderer/export-render', () => ({ renderSlidesToPngBase64: vi.fn() }))
vi.mock('../src/renderer/i18n/locale', () => ({ getLang: () => 'zh', t: (key: string) => key }))
vi.mock('../src/renderer/components/toast-bus', () => ({ showToast: vi.fn() }))
import { exportCompatiblePptx } from '../src/renderer/file-actions'
import { showToast } from '../src/renderer/components/toast-bus'

it('shows path dialog failures and releases the export lock for another attempt', async () => {
  const pick = vi.fn().mockRejectedValue(new Error('Permission denied'))
  Object.assign(window, { slidesApi: { pickExportVisualPptxPath: pick } })
  const setStatus = vi.fn()
  const ctx = { flushNotes: vi.fn(), path: 'demo.pptx', setStatus } as unknown as ActionCtx
  await exportCompatiblePptx(ctx)
  expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('Permission denied'))
  expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Permission denied'), 'error')
  pick.mockResolvedValue(null)
  await exportCompatiblePptx(ctx)
  expect(pick).toHaveBeenCalledTimes(2)
})

it('shows failures while committing notes before opening the save dialog', async () => {
  const setStatus = vi.fn()
  const ctx = {
    flushNotes: vi.fn().mockRejectedValue(new Error('Notes failed')),
    setStatus,
  } as unknown as ActionCtx
  await exportCompatiblePptx(ctx)
  expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Notes failed'), 'error')
})
