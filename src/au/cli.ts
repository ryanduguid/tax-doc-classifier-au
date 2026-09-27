#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { LAYA_DEFAULT_URL, LAYA_MODELS, layaBackend, type LayaModel } from '../backend.js'
import { readAuPages, retryAuPagesWithPaddle } from './input.js'
import { classifyAuPage, classifyAuRules, type AuResult } from './classify.js'

// The CLI never sends page text off this machine, so a Laya server must listen on a loopback address.
function layaUrl(value = LAYA_DEFAULT_URL): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('The Laya server must run on this machine: use a loopback URL.')
  }
  return url.origin
}

function layaModel(value: string = LAYA_MODELS[0]): LayaModel {
  if (!LAYA_MODELS.includes(value as LayaModel)) throw new Error(`--laya-model must be one of ${LAYA_MODELS.join(', ')}`)
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
      'Writes a JSON review manifest to stdout. Local rules only; --laya sends pages the rules leave unknown or ambiguous to a Laya server on this machine. Never uploads or moves inputs.')
    return
  }
  if (positionals.length !== 1) throw new Error('Supply exactly one input file. Use --help for usage.')
  if (Boolean(values['paddle-python']) !== Boolean(values['paddle-models'])) throw new Error('Supply both Paddle options.')
  if ((values['laya-url'] !== undefined || values['laya-model'] !== undefined) && !values.laya) throw new Error('Laya options require --laya.')
  let backend
  if (values.laya) {
    const baseUrl = layaUrl(values['laya-url'])
    const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) }).catch(() => null)
    if (!health?.ok) throw new Error(`No Laya server answered at ${baseUrl}/health.`)
    backend = layaBackend({ baseUrl, model: layaModel(values['laya-model']) })
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

main().catch(() => {
  console.error('Classification failed. Check --help, input format, the local PDF runtime and any Laya server. No documents were uploaded or changed.')
  process.exitCode = 1
})
