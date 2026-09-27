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
  // Blank lines before a request: the context patterns must not rescan them from every line start.
  for (const gap of ['\n', '\r\n', ' \t\n']) {
    expect(classifyAuRules({ page: 1, text: gap.repeat(Math.floor(190_000 / gap.length)) + 'Please send a tax invoice\nGST and total due', extraction: 'native' }).reason)
      .toBe('context_only_or_instructions')
  }
  // A generous regression ceiling, not a latency promise. The prior regex took seconds.
  expect(performance.now() - start).toBeLessThan(1000)
})
