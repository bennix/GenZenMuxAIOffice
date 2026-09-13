import { afterEach, expect, it, vi } from 'vitest'
import { insertOfficeImage } from './office-bridge'
import { useSettings } from './store/settingsStore'
afterEach(() => {
  delete window.loveArtOffice
  localStorage.clear()
})
it('returns a selected image through the host and reports failures', async () => {
  const insertImage = vi.fn().mockResolvedValue(undefined)
  const fetchImage = vi.fn().mockResolvedValue({ mime: 'image/png', base64: 'YWJj' })
  window.loveArtOffice = { insertImage, fetchImage }
  await insertOfficeImage('https://example.com/image.png')
  expect(fetchImage).toHaveBeenCalledWith('https://example.com/image.png')
  expect(insertImage).toHaveBeenCalledWith('data:image/png;base64,YWJj')
  await expect(insertOfficeImage('file:///private/file')).rejects.toThrow('PNG')
  insertImage.mockRejectedValueOnce(new Error('Document closed'))
  await expect(insertOfficeImage('data:image/png;base64,YWJj')).rejects.toThrow('Document closed')
})
it('does not persist the shared Office API key', () => {
  useSettings.getState().setApiKey('test-office-key')
  expect(useSettings.getState().apiKey).toBe('test-office-key')
  expect(localStorage.getItem('zenoffice_loveart_settings')).not.toContain('test-office-key')
})
it('shares an image to a chosen file and surfaces target rejection', async () => {
  const shareImage = vi.fn().mockResolvedValue({ ok: true })
  const insertImage = vi.fn()
  window.loveArtOffice = { insertImage, fetchImage: vi.fn(), shareImage }
  await insertOfficeImage('data:image/png;base64,YWJj', 'pdf-target')
  expect(shareImage).toHaveBeenCalledWith('pdf-target', 'data:image/png;base64,YWJj')
  expect(insertImage).not.toHaveBeenCalled()
  shareImage.mockResolvedValue({ ok: false, error: 'PDF 当前不可编辑。' })
  await expect(insertOfficeImage('data:image/png;base64,YWJj', 'pdf-target')).rejects.toThrow(
    '不可编辑',
  )
})
