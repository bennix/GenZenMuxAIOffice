import { describe, expect, it } from 'vitest'
import { currentRuntimeDateContext } from './runtimeContext'

describe('runtime context', () => {
  it('formats a Chinese current date instruction from the provided runtime date', () => {
    const context = currentRuntimeDateContext('zh', new Date('2026-06-30T12:00:00+08:00'))

    expect(context).toContain('当前日期')
    expect(context).toContain('2026')
    expect(context).toContain('不要生成过去年份')
  })

  it('formats an English current date instruction from the provided runtime date', () => {
    const context = currentRuntimeDateContext('en', new Date('2026-06-30T12:00:00+08:00'))

    expect(context).toContain('Current runtime date')
    expect(context).toContain('2026')
    expect(context).toContain('Do not generate stale past-year')
  })
})
