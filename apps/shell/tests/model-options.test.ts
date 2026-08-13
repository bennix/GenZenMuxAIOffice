import { describe, expect, it } from 'vitest'
import { removeActiveModel, resolveModelOptions } from '../src/renderer/src/model-options'

describe('settings model options', () => {
  it('keeps legacy custom models while honoring deleted built-ins', () => {
    expect(
      resolveModelOptions(
        ['built-in/a', 'built-in/b'],
        ['vendor/custom'],
        ['built-in/b'],
        'built-in/a',
      ),
    ).toEqual(['built-in/a', 'vendor/custom'])
  })

  it('keeps the active model available even if stale removal data contains it', () => {
    expect(resolveModelOptions(['a', 'b'], [], ['a'], 'a')).toEqual(['a', 'b'])
  })

  it('deletes the selected model and selects the next available model', () => {
    expect(removeActiveModel(['a', 'b', 'c'], 'b')).toEqual({
      models: ['a', 'c'],
      active: 'a',
    })
  })

  it('refuses to delete the final model', () => {
    expect(removeActiveModel(['a'], 'a')).toBeNull()
  })
})
