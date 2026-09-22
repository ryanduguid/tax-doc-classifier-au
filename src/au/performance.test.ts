import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { classifyAuRules } from './classify.js'

it('bounds repeated-token failure cases near the maximum accepted page length', () => {
  const start = performance.now()
  for (const [heading, token] of [['Tax invoice', 'GST '], ['Tax invoice', 'total '], ['BAS', 'G1 '], ['BAS', '1A ']]) {
    const text = heading + '\n' + token.repeat(Math.floor((199_999 - heading.length) / token.length))
    expect(classifyAuRules({ page: 1, text, extraction: 'native' }).documentType).toBe('unknown')
  }
  expect(classifyAuRules({ page: 1, text: ' '.repeat(190_000) + 'Unlisted document', extraction: 'native' }).documentType).toBe('unknown')
  // A generous regression ceiling, not a latency promise. The prior regex took seconds.
  expect(performance.now() - start).toBeLessThan(1000)
})
