#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { LAYA_MODELS, layaBackend, localLayaUrl, type LayaModel } from '../backend.js'
import { readAuPages, retryAuPagesWithPaddle } from './input.js'
import { classifyAuPage, classifyAuRules, type AuResult } from './classify.js'

/** An argument problem; its message names no document content, so it may be printed. */
class UsageError extends Error {}

function layaModel(value: string = LAYA_MODELS[0]): LayaModel {
  if (!LAYA_MODELS.includes(value as LayaModel)) throw new UsageError(`--laya-model must be one of ${LAYA_MODELS.join(', ')}.`)
  return value as LayaModel
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    python: { type: 'string' }, ocr: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    'paddle-python': { type: 'string' }, 'paddle-models': { type: 'string' },
    laya: { type: 'boolean' }, 'laya-url': { type: 'string' }, 'laya-model': { type: 'string' },
  } })
  if (values.help) {
    console.log('Usage: tax-doc-au <file.pdf|file.txt|pages.json> [--python <executable>] [--ocr]\n' +
      'Optional fallback: --paddle-python <executable> --paddle-models <directory>\n' +
      'Optional local model: --laya [--laya-url http://127.0.0.1:8000] [--laya-model typed-decisions|multilingual|english]\n' +
      'Writes a JSON review manifest to stdout. Rules decide by default; --laya sends pages the rules leave unknown or ambiguous to a Laya server on this machine. Never uploads or moves inputs.')
    return
  }
  if (positionals.length !== 1) throw new UsageError('Supply exactly one input file. Use --help for usage.')
  if (Boolean(values['paddle-python']) !== Boolean(values['paddle-models'])) throw new UsageError('Supply both --paddle-python and --paddle-models.')
  if ((values['laya-url'] !== undefined || values['laya-model'] !== undefined) && !values.laya) throw new UsageError('--laya-url and --laya-model require --laya.')
  let backend
  if (values.laya) {
    let baseUrl: string
    try { baseUrl = localLayaUrl(values['laya-url']) } catch (err) { throw new UsageError((err as Error).message) }
    const model = layaModel(values['laya-model'])
    const health = await fetch(`${baseUrl}/health`, { redirect: 'error', signal: AbortSignal.timeout(5_000) }).catch(() => null)
    if (!health?.ok) throw new UsageError(`No Laya server answered at ${baseUrl}/health.`)
    backend = layaBackend({ baseUrl, model })
  }
  let pages = await readAuPages(positionals[0], values)
  if (values['paddle-python'] && values['paddle-models']) {
    pages = await retryAuPagesWithPaddle(positionals[0], pages, { python: values['paddle-python'], models: values['paddle-models'] })
  }
  const results: AuResult[] = []
  // One page at a time: laya-serve runs a single inference worker.
  for (const page of pages) {
    results.push(backend ? await classifyAuPage(page, { backend, allowModelProcessing: true, modelPolicy: 'uncertain' }) : classifyAuRules(page))
  }
  console.log(JSON.stringify({ schemaVersion: 'au-review-1', mode: backend ? 'local-rules+laya' : 'local-rules', requiresReview: true,
    summary: { pages: results.length, review: results.length, automaticallyFiled: 0 }, results }, null, 2))
}

main().catch((err: unknown) => {
  // Other failures may echo document text or local paths, so only argument problems are named.
  console.error(err instanceof UsageError ? err.message :
    'Classification failed. Check --help, input format, the local PDF runtime and any Laya server. No documents were uploaded or changed.')
  process.exitCode = 1
})
