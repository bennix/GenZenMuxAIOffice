import { describe, expect, it } from 'vitest'
import { classifyAgentScope } from './agentScope'

describe('agent scope classifier', () => {
  it('classifies image requests', () => {
    expect(classifyAgentScope({ prompt: '生成一张冰箱海报', modeHint: 'image' })).toMatchObject({
      scenario: 'image_generation',
      expectedOutput: 'image card',
    })
  })

  it('classifies video requests', () => {
    expect(classifyAgentScope({ prompt: '生成一个产品视频', modeHint: 'video' })).toMatchObject({
      scenario: 'video_generation',
      expectedOutput: 'video card',
    })
  })

  it('classifies branch requests', () => {
    expect(classifyAgentScope({ prompt: '让这张图更冷调', isBranch: true })).toMatchObject({
      scenario: 'branch_generation',
      expectedOutput: 'branch target card',
    })
  })
})
