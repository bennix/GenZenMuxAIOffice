import { Script } from 'node:vm'

import { describe, expect, it } from 'vitest'

import { buildLibreOfficeProgressHtml } from '../src/main/libreoffice-install-progress'

describe('LibreOffice installation progress window', () => {
  it.each([true, false])('emits syntactically valid page JavaScript (Chinese=%s)', (chinese) => {
    const html = buildLibreOfficeProgressHtml(chinese)
    const source = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]
    expect(source).toBeTruthy()
    expect(() => new Script(source)).not.toThrow()
    expect(html).toContain('id="log"')
    expect(html).toContain('setInstallProgress')
  })
})
