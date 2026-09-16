import { describe, expect, it } from 'vitest'
import { ToolRegistry } from './registry'
import { registerApplicationTools } from './application-tools'
import { applicationBridgeClient, startApplicationBridge } from './application-bridge'

describe('application bridge', () => {
  it('runs validated application operations and rejects unauthorized and browser requests', async () => {
    const registry = new ToolRegistry()
    const created: string[] = []
    registerApplicationTools(registry, {
      status: () => ({ version: 'test' }),
      listTabs: () => [{ id: 'doc-1' }],
      activateTab: () => {
        throw new Error('标签不存在')
      },
      openFile: (path) => ({ path }),
      createDocument: (kind) => {
        created.push(kind)
        return { saved: false }
      },
    })
    const token = 'a'.repeat(48)
    const bridge = await startApplicationBridge(registry, token)
    try {
      const call = applicationBridgeClient(bridge.port, token)
      expect(await call('application_status', {})).toEqual({ version: 'test' })
      expect(await call('application_create_document', { kind: 'word' })).toEqual({ saved: false })
      await expect(call('application_create_document', { kind: 'invalid' })).rejects.toThrow()
      expect(created).toEqual(['word'])
      await expect(call('application_activate_tab', { id: 'missing' })).rejects.toThrow(
        '标签不存在',
      )
      await expect(
        applicationBridgeClient(bridge.port, 'b'.repeat(48))('application_status', {}),
      ).rejects.toThrow('403')
      const response = await fetch(`http://127.0.0.1:${bridge.port}/call`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Origin: 'https://example.com' },
        body: JSON.stringify({ name: 'application_status' }),
      })
      expect(response.status).toBe(403)
    } finally {
      await bridge.close()
    }
  })
  it('rejects weak credentials and invalid ports', async () => {
    await expect(startApplicationBridge(new ToolRegistry(), 'short')).rejects.toThrow('32')
    expect(() => applicationBridgeClient(0, 'a'.repeat(48))).toThrow()
  })
})
