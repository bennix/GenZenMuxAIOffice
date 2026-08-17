import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConnectApi } from '@genoffice/electron-utils/connect'
import { connectMenuPosition } from './ConnectButton'
import { ConnectButton } from './ConnectButton'

describe('connectMenuPosition', () => {
  it('keeps the target list inside the left edge of a narrow window', () => {
    const position = connectMenuPosition({ left: 5, right: 29, top: 400, bottom: 424 }, 360, 600)
    expect(position.left).toBe(8)
    expect(position.top).toBeLessThan(400)
  })

  it('opens below when there is no useful room above', () => {
    const position = connectMenuPosition({ left: 300, right: 324, top: 20, bottom: 44 }, 360, 600)
    expect(position.left).toBe(94)
    expect(position.top).toBe(50)
  })
})

describe('ConnectButton labelled action', () => {
  it('keeps the visible label inside the same clickable button as the Connect arrow', () => {
    const api = {} as ConnectApi
    const html = renderToStaticMarkup(
      <ConnectButton
        api={api}
        text="complete report"
        className="complete-report"
        label={<span>发送完整报告</span>}
      />,
    )
    expect(html).toContain('<button')
    expect(html).toContain('complete-report')
    expect(html).toContain('↗<span>发送完整报告</span></button>')
  })
})
