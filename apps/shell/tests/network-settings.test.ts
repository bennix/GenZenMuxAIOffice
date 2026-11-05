// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkSettings } from '../src/renderer/src/NetworkSettings'
import type { HomeApi } from '../src/shared/home-api'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let div: HTMLDivElement | undefined
afterEach(() => {
  act(() => root?.unmount())
  div?.remove()
  vi.restoreAllMocks()
})
describe('network settings entry', () => {
  it('loads saved mode and uses the explicit save-and-check action without displaying secrets', async () => {
    const set = vi.fn(async () => ({
      preferences: { mode: 'auto' as const },
      status: { mode: 'system', state: 'ready' as const, checkedAt: 1 },
    }))
    const check = vi.fn(async () => ({
      ok: true,
      httpStatus: 401,
      status: { mode: 'system', state: 'ready' as const, checkedAt: 2 },
    }))
    window.aiOffice = {
      getAiNetworkSettings: set,
      setAiNetworkSettings: set,
      checkAiNetwork: check,
    } as unknown as HomeApi
    div = document.createElement('div')
    document.body.appendChild(div)
    root = createRoot(div)
    await act(async () => root!.render(React.createElement(NetworkSettings, { zh: true })))
    expect(div.textContent).toContain('网络与代理')
    expect((div.querySelector('select') as HTMLSelectElement).value).toBe('auto')
    expect(check).not.toHaveBeenCalled()
    const button = [...div.querySelectorAll('button')].find(
      (node) => node.textContent === '保存并立即检测',
    )!
    await act(async () => button.click())
    expect(check).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith({ mode: 'auto' })
    expect(div.textContent).toContain('HTTP 401')
    expect(div.textContent).toContain('未测试 API 密钥')
  })
  it('shows a failure in the settings pane instead of throwing a startup error', async () => {
    window.aiOffice = {
      getAiNetworkSettings: vi.fn().mockRejectedValue(new Error('offline')),
    } as unknown as HomeApi
    div = document.createElement('div')
    document.body.appendChild(div)
    root = createRoot(div)
    await act(async () => root!.render(React.createElement(NetworkSettings, { zh: true })))
    expect(div.textContent).toContain('无法读取网络设置')
    expect([...div.querySelectorAll('button')].every((button) => button.disabled)).toBe(true)
  })
})
