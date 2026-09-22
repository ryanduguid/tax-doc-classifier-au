#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readAuPages, retryAuPagesWithPaddle } from './input.js'
import { classifyAuRules } from './classify.js'

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    python: { type: 'string' }, ocr: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    'paddle-python': { type: 'string' }, 'paddle-models': { type: 'string' },
  } })
  if (values.help) {
    console.log('Usage: tax-doc-au <file.pdf|file.txt|pages.json> [--python <executable>] [--ocr]\nOptional fallback: --paddle-python <executable> --paddle-models <directory>\nWrites a JSON review manifest to stdout. Local rules only; never uploads or moves inputs.')
    return
  }
  if (positionals.length !== 1) throw new Error('Supply exactly one input file. Use --help for usage.')
  if (Boolean(values['paddle-python']) !== Boolean(values['paddle-models'])) throw new Error('Supply both Paddle options.')
  let pages = await readAuPages(positionals[0], values)
  if (values['paddle-python'] && values['paddle-models']) {
    pages = await retryAuPagesWithPaddle(positionals[0], pages, { python: values['paddle-python'], models: values['paddle-models'] })
  }
  const results = pages.map(classifyAuRules)
  console.log(JSON.stringify({ schemaVersion: 'au-review-1', mode: 'local-rules', requiresReview: true,
    summary: { pages: results.length, review: results.length, automaticallyFiled: 0 }, results }, null, 2))
}

main().catch(() => {
  console.error('Classification failed. Check --help, input format and the local PDF runtime. No documents were uploaded or changed.')
  process.exitCode = 1
})
