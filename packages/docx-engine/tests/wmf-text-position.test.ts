import { afterEach, describe, expect, it, vi } from 'vitest'
import { convertWmfToDataUrl } from '../src/vendor/emf-converter/index.mjs'

function record(type: number, data: Buffer): Buffer {
  const value = Buffer.alloc(6 + data.length)
  value.writeUInt32LE(value.length / 2, 0)
  value.writeUInt16LE(type, 4)
  data.copy(value, 6)
  return value
}
const words = (...values: number[]) => {
  const data = Buffer.alloc(values.length * 2)
  values.forEach((value, index) => data.writeInt16LE(value, index * 2))
  return data
}
function metafile(
  options: {
    family?: string
    charset?: number
    fontWidth?: number
    bytes?: Buffer
    pen?: boolean
  } = {},
): ArrayBuffer {
  const header = Buffer.alloc(18)
  header.writeUInt16LE(1, 0)
  header.writeUInt16LE(9, 2)
  header.writeUInt16LE(0x300, 4)
  const font = Buffer.alloc(50)
  font.writeInt16LE(-320, 0)
  font.writeInt16LE(400, 8)
  font[13] = options.charset ?? 2
  font.writeInt16LE(options.fontWidth ?? 0, 2)
  font.write(options.family ?? 'Symbol', 18, 'ascii')
  const bytes = options.bytes ?? Buffer.from('abc')
  const advances = Array.from(bytes, (_, index) => (index + 1) * 100)
  const text = Buffer.concat([
    words(0, 0, bytes.length, 0),
    bytes,
    ...(bytes.length % 2 ? [Buffer.alloc(1)] : []),
    words(...advances),
  ])
  const buffer = Buffer.concat([
    header,
    record(0x20c, words(480, 6528)), // SETWINDOWEXT (y,x)
    record(0x2fb, font),
    record(0x12d, words(0)),
    record(0x12e, words(25)), // TA_UPDATECP | TA_BASELINE
    record(0x214, words(320, 214)), // MOVETO supplies the text origin
    record(0xa32, text),
    record(0xa32, text),
    ...(options.pen
      ? [
          record(0x2fa, words(0, 16, 0, 0, 0)),
          record(0x12d, words(1)),
          record(0x214, words(20, 20)),
          record(0x213, words(20, 200)),
        ]
      : []),
    record(0, Buffer.alloc(0)),
  ])
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) as ArrayBuffer
}

afterEach(() => vi.unstubAllGlobals())

function canvasMock() {
  const fillText = vi.fn()
  const scale = vi.fn()
  const context = new Proxy(
    { fillText, scale, measureText: () => ({ width: 10 }) } as Record<string, unknown>,
    {
      get(target, key: string) {
        return target[key] ?? (() => {})
      },
    },
  )
  class Canvas {
    width = 0
    height = 0
    getContext() {
      return context
    }
    toDataURL() {
      return 'data:image/png;base64,FORMULA'
    }
  }
  const canvas = new Canvas()
  vi.stubGlobal('OffscreenCanvas', undefined)
  vi.stubGlobal('HTMLCanvasElement', Canvas)
  vi.stubGlobal('document', { createElement: () => canvas })
  return { fillText, scale, context, canvas }
}

describe('non-placeable formula WMF text', () => {
  it('uses the current position, baseline and character advances instead of cropping text at (0,0)', async () => {
    const { fillText, context, canvas } = canvasMock()
    expect(
      await convertWmfToDataUrl(metafile(), {
        dpiScale: 2,
        displayWidthPx: 272,
        displayHeightPx: 20,
      }),
    ).toBe('data:image/png;base64,FORMULA')
    expect(canvas.width).toBe(544)
    expect(canvas.height).toBe(40)
    expect(context.textBaseline).toBe('alphabetic')
    expect(String(context.font)).toContain('Symbol')
    expect(fillText.mock.calls[0][0]).toBe('α')
    expect(fillText.mock.calls[1][0]).toBe('β')
    expect(fillText.mock.calls[0][1]).toBeCloseTo((214 / 6528) * 544)
    expect(fillText.mock.calls[0][2]).toBeCloseTo((320 / 480) * 40)
    expect(fillText.mock.calls[1][1]).toBeCloseTo((314 / 6528) * 544)
    expect(fillText.mock.calls[3][1]).toBeCloseTo((814 / 6528) * 544)
  })
  it('decodes GBK double bars and merges the corresponding byte advances', async () => {
    const { fillText } = canvasMock()
    await convertWmfToDataUrl(
      metafile({ family: 'SimSun', charset: 134, bytes: Buffer.from([0xa1, 0xac]) }),
      { dpiScale: 2, displayWidthPx: 272, displayHeightPx: 20 },
    )
    expect(fillText.mock.calls[0][0]).toBe('‖')
    expect(fillText.mock.calls[1][1]).toBeCloseTo((514 / 6528) * 544)
  })

  it('scales fraction-rule pens and honors the requested narrow delimiter font width', async () => {
    const { context, scale } = canvasMock()
    await convertWmfToDataUrl(metafile({ fontWidth: 100, pen: true }), {
      dpiScale: 2,
      displayWidthPx: 272,
      displayHeightPx: 20,
    })
    expect(context.lineWidth).toBeCloseTo((16 / 6528) * 544)
    expect(scale).toHaveBeenCalledWith(((100 / 6528) * 544) / 10, 1)
  })
})
