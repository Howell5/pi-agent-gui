import { describe, expect, it } from 'vitest'
import { flattenModelOptions, parseModelKey } from '../src/main/provider-catalog'

describe('flat model catalog', () => {
  it('keeps provider routing inside a flat model option', () => {
    const options = flattenModelOptions('deepseek', 'DeepSeek', [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }])
    expect(options).toEqual([expect.objectContaining({ key: 'deepseek::deepseek-v4-pro', providerId: 'deepseek', modelId: 'deepseek-v4-pro' })])
  })

  it('round trips a model key', () => {
    expect(parseModelKey('openai::gpt-5')).toEqual({ providerId: 'openai', modelId: 'gpt-5' })
  })
})
