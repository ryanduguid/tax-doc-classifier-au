import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { readAuPages, classifyAuRules, retryAuPagesWithPaddle } from '../src/au/index.js'

const python = process.argv[2] ?? 'python'
const root = new URL('../eval/au/pdf/', import.meta.url)
const path = (name: string) => fileURLToPath(new URL(name, root))
const hash = async (name: string) => createHash('sha256').update(await readFile(path(name))).digest('hex')
const before = await hash('native-pack.pdf')
const native = await readAuPages(path('native-pack.pdf'), { python })
assert.deepEqual(native.map(p => p.page), [1, 2, 3])
assert.deepEqual(native.map(p => classifyAuRules(p).documentType), ['tax-invoice', 'bank-statement', 'unknown'])
assert.equal(await hash('native-pack.pdf'), before)
const scan = await readAuPages(path('scan.pdf'), { python })
assert.equal(scan.length, 1)
assert.equal(classifyAuRules(scan[0]).documentType, 'unreadable')
const ocr = await readAuPages(path('scan.pdf'), { python, ocr: true })
assert.equal(ocr[0].extraction, 'ocr')
assert.equal(classifyAuRules(ocr[0]).documentType, 'tax-invoice')
assert.equal(classifyAuRules(ocr[0]).requiresReview, true)
const empty = await readAuPages(path('empty.pdf'), { python })
assert.equal(classifyAuRules(empty[0]).documentType, 'unreadable')
const { stdout } = await promisify(execFile)(process.execPath,
  [fileURLToPath(new URL('../dist/au/cli.js', import.meta.url)), path('native-pack.pdf'), '--python', python])
const manifest = JSON.parse(stdout)
assert.equal(manifest.results.length, 3)
assert.equal(manifest.summary.automaticallyFiled, 0)
assert.ok(!stdout.includes('Example supplies'))
console.log('PDF integration PASS: native pack, image-only refusal, offline OCR, empty page, built CLI, unchanged input and manifest privacy')

if (process.argv[3] && process.argv[4]) {
  const sideways = await readAuPages(path('scan-sideways.pdf'), { python, ocr: true })
  assert.equal(classifyAuRules(sideways[0]).documentType, 'unknown')
  const fixed = await retryAuPagesWithPaddle(path('scan-sideways.pdf'), sideways,
    { python: process.argv[3], models: process.argv[4] })
  assert.equal(classifyAuRules(fixed[0]).documentType, 'tax-invoice')
  assert.equal(fixed[0].ocrEngine, 'paddleocr-3.7.0-pp-ocrv6-small')
  assert.equal(classifyAuRules(fixed[0]).requiresReview, true)
  const failed = await retryAuPagesWithPaddle(path('scan-sideways.pdf'), sideways,
    { python: process.argv[3], models: path('missing-models') })
  assert.ok(failed[0].warnings?.includes('paddle_fallback_failed'))
  assert.equal(classifyAuRules(failed[0]).documentType, 'unreadable')
  const noRetry = await retryAuPagesWithPaddle(path('native-pack.pdf'), native,
    { python: 'missing-python', models: 'missing-models' })
  assert.strictEqual(noRetry, native)
  const { stdout: fallbackOutput } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('../dist/au/cli.js', import.meta.url)), path('scan-sideways.pdf'), '--python', python,
      '--ocr', '--paddle-python', process.argv[3], '--paddle-models', process.argv[4]])
  assert.equal(JSON.parse(fallbackOutput).results[0].documentType, 'tax-invoice')
  assert.ok(!fallbackOutput.includes('Example supplies'))
  console.log('Paddle fallback PASS: sideways recovery, offline local models, missing-model refusal, native-page bypass and built CLI')
}
