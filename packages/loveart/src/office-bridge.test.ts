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

it('inserts a downloaded MP4 as video and rejects unsupported assets', async () => {
  const { insertOfficeVideo } = await import('./office-bridge')
  const insertVideo = vi.fn().mockResolvedValue(undefined)
  const fetchMedia = vi.fn().mockResolvedValue({ mime: 'video/mp4', base64: 'AAAAAGZ0eXA=' })
  window.loveArtOffice = { insertImage: vi.fn(), fetchImage: vi.fn(), insertVideo, fetchMedia }
  await insertOfficeVideo('https://example.com/movie.mp4')
  expect(fetchMedia).toHaveBeenCalledWith('https://example.com/movie.mp4')
  expect(insertVideo).toHaveBeenCalledWith('data:video/mp4;base64,AAAAAGZ0eXA=')
  fetchMedia.mockResolvedValueOnce({ mime: 'image/png', base64: 'YWJj' })
  await expect(insertOfficeVideo('https://example.com/image.png')).rejects.toThrow('MP4')
  await expect(insertOfficeVideo('data:video/webm;base64,YWJj')).rejects.toThrow('MP4')
  expect(insertVideo).toHaveBeenCalledTimes(1)
})

it('requires a PPT host for video and propagates insertion failure', async () => {
  const { insertOfficeVideo } = await import('./office-bridge')
  await expect(insertOfficeVideo('data:video/mp4;base64,AAAAAGZ0eXA=')).rejects.toThrow('PPT')
  window.loveArtOffice = {
    insertImage: vi.fn(),
    fetchImage: vi.fn(),
    insertVideo: vi.fn().mockRejectedValue(new Error('Presentation closed')),
  }
  await expect(insertOfficeVideo('data:video/mp4;base64,AAAAAGZ0eXA=')).rejects.toThrow(
    'Presentation closed',
  )
})
