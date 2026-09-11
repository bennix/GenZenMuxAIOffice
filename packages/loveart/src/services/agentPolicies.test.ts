import { describe, expect, it } from 'vitest'
import { selectAgentPolicies } from './agentPolicies'

describe('agent policy registry', () => {
  it('loads core runtime and image policies for image mode', () => {
    expect(selectAgentPolicies({ mode: 'image' }).map((policy) => policy.id)).toEqual([
      'core',
      'runtime',
      'image',
    ])
  })

  it('loads video policy for video mode', () => {
    expect(selectAgentPolicies({ mode: 'video' }).map((policy) => policy.id)).toContain('video')
  })

  it('loads branch and Open Design policies only when applicable', () => {
    expect(
      selectAgentPolicies({ mode: 'image', isBranch: true, hasOpenDesign: true }).map(
        (policy) => policy.id,
      ),
    ).toEqual(['core', 'runtime', 'image', 'branch', 'open-design'])
  })
})
