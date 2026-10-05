import { expect, it } from 'vitest'
import { compareLayoutPixels, auditOfficeLayout } from '../src/office-layout-audit'

function pixels(value: number, alpha = 255) {
  const data = new Uint8Array(128 * 64 * 4)
  for (let i = 0; i < data.length; i += 4) data.set([value, value, value, alpha], i)
  return { width: 128, height: 64, data }
}

it('compares transparent pixels against white and locates only differing blocks', () => {
  expect(compareLayoutPixels(pixels(0, 0), pixels(255), 1).status).toBe('passed')
  const target = pixels(255)
  for (let y = 0; y < 64; y++) {
    for (let x = 64; x < 128; x++) target.data.set([0, 0, 0, 255], (y * 128 + x) * 4)
  }
  const result = compareLayoutPixels(pixels(255), target, 2)
  expect(result.status).toBe('review-required')
  expect(result.normalizedMse).toBe(0.5)
  expect(result.regions).toEqual([{ x: 64, y: 0, width: 64, height: 64, normalizedMse: 1 }])
})

it('rejects mismatched dimensions instead of claiming visual success', () => {
  expect(() => compareLayoutPixels(pixels(255), { ...pixels(255), width: 64 }, 1)).toThrow()
})

it('reports absent source references as unavailable', async () => {
  expect(await auditOfficeLayout('missing.pptx', [], () => pixels(255))).toMatchObject({
    status: 'unavailable',
    pages: [],
  })
})
