import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboard'

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

afterEach(() => {
  vi.restoreAllMocks()
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  else Reflect.deleteProperty(globalThis, 'navigator')
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

describe('copyTextToClipboard', () => {
  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText } },
    })

    await expect(copyTextToClipboard('```mermaid\ngraph TD\n```')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('```mermaid\ngraph TD\n```')
  })

  it('falls back to execCommand when clipboard permission is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    const textarea = {
      value: '',
      style: {} as CSSStyleDeclaration,
      setAttribute: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove: vi.fn(),
    }
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText } },
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: vi.fn().mockReturnValue(textarea),
        body: { appendChild: vi.fn() },
        execCommand,
      },
    })

    await expect(copyTextToClipboard('$$x^2$$')).resolves.toBe(true)
    expect(textarea.value).toBe('$$x^2$$')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(textarea.remove).toHaveBeenCalled()
  })
})
