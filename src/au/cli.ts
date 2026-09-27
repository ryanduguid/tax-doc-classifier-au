#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { LAYA_MODELS, layaBackend, localLayaUrl, type LayaModel } from '../backend.js'
import { readAuPages, retryAuPagesWithPaddle } from './input.js'
import { classifyAuPage, classifyAuRules, type AuResult } from './classify.js'
import { decisionTemplate, summariseReview, validateDecisions, validateManifest } from './review.js'

/** An argument problem; its message names no document content, so it may be printed. */
class UsageError extends Error {}

/** `review <manifest> [decisions]`: drafts a decisions file, or measures decisions against the manifest. */
async function review(paths: string[]) {
  if (paths.length < 1 || paths.length > 2) throw new UsageError('Usage: tax-doc-au review <manifest.json> [decisions.json]')
  // A parse error would echo file content, so it is replaced with a fixed message.
  const json = (raw: string) => { try { return JSON.parse(raw.replace(/^\uFEFF/, '')) } catch { throw new UsageError('The file is not valid JSON.') } }
  const raw = await readFile(paths[0], 'utf8')
  // Decisions bind to the exact manifest file, so an edited or regenerated manifest cannot claim them.
  const manifestSha256 = createHash('sha256').update(raw).digest('hex')
  let manifest, decisions
  try { manifest = validateManifest(json(raw)) } catch (err) { throw new UsageError((err as Error).message) }
  if (!paths[1]) return console.log(JSON.stringify(decisionTemplate(manifest, manifestSha256), null, 2))
  try {
    decisions = validateDecisions(json(await readFile(paths[1], 'utf8')))
    console.log(JSON.stringify(summariseReview(manifest, decisions, manifestSha256), null, 2))
  } catch (err) { throw new UsageError((err as Error).message) }
}

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
      'Review decisions: tax-doc-au review <manifest.json> [decisions.json] (without decisions, prints a template to edit)\n' +
      'Writes a JSON review manifest to stdout. Rules decide by default; --laya sends pages the rules leave unknown or ambiguous to a Laya server on this machine. Never uploads or moves inputs.')
    return
  }
  if (positionals[0] === 'review') return review(positionals.slice(1))
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
