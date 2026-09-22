import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { readAuPages, classifyAuRules, retryAuPagesWithPaddle, retryAuDocumentsWithPaddle } from '../src/au/index.js'

const [python, paddlePython, models] = process.argv.slice(2)
if (!python || !paddlePython || !models) throw new Error('Supply pdf-inspector Python, Paddle Python and local models.')
const file = fileURLToPath(new URL('../eval/au/pdf/scan-sideways.pdf', import.meta.url))
const pages = await readAuPages(file, { python, ocr: true })
assert.equal(classifyAuRules(pages[0]).documentType, 'unknown', 'Confirm the first engine needs fallback on this file')
const options = { python: paddlePython, models }
const samples: { order: string; separateMs: number; batchMs: number }[] = []
async function measure(batch: boolean) {
  const start = performance.now()
  const results = batch ? await retryAuDocumentsWithPaddle([{ file, pages }, { file, pages }], options)
    : [await retryAuPagesWithPaddle(file, pages, options), await retryAuPagesWithPaddle(file, pages, options)]
  assert.deepEqual(results.map(rows => classifyAuRules(rows[0]).documentType), ['tax-invoice', 'tax-invoice'])
  return Math.round(performance.now() - start)
}
// Alternate order to reduce filesystem-cache order effects. Model files are already local.
for (const first of [false, true]) {
  const a = await measure(first), b = await measure(!first)
  samples.push({ order: first ? 'batch-first' : 'separate-first', separateMs: first ? b : a, batchMs: first ? a : b })
}
const report = { schema: 'au-paddle-batch-benchmark-1', fixture: 'scan-sideways.pdf', documentsPerBatch: 2,
  scope: 'Two copies of one synthetic page on this Windows machine; model downloads excluded; process startup included.',
  samples, realIssuerThroughputMeasured: false }
await writeFile(new URL('../eval/au/paddle-batch-benchmark.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
