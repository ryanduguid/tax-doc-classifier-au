import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { LAYA_DEFAULT_URL, LAYA_MODELS, classifyAuPage, layaBackend, type AskResult, type AuOutcome, type Backend, type LayaModel } from '../../src/au/index.js'
import { FILES, evaluate, loadCorpus } from './corpus.js'

// Measures a local Laya server on the synthetic corpus. Run laya-serve first; nothing leaves this machine.
const { values } = parseArgs({ options: {
  model: { type: 'string', default: LAYA_MODELS[0] }, url: { type: 'string', default: LAYA_DEFAULT_URL }, gate: { type: 'string', default: '0.95' },
} })
const model = values.model as LayaModel
if (!LAYA_MODELS.includes(model)) throw new Error(`--model must be one of ${LAYA_MODELS.join(', ')}`)
const gate = Number(values.gate)
const health = await (await fetch(`${values.url}/health`)).json()
// Tokens per request at each checkpoint's context limit; a page at the limit was truncated by the server.
const CONTEXT: Record<LayaModel, number> = { english: 512, multilingual: 1024, 'typed-decisions': 1024 }

// One server call per page: the second policy pass replays the recorded answer.
const answers = new Map<string, AskResult>()
let current = ''
let calls = 0
const server = layaBackend({ baseUrl: values.url, model })
const backend: Backend = { async ask(state, questions) {
  let result = answers.get(current)
  if (!result) {
    result = await server.ask(state, questions)
    answers.set(current, result)
    calls++
  }
  return result
} }

const { datasets, hashes } = await loadCorpus()
const started = Date.now()
const mean = (xs: number[]) => xs.length ? Number((xs.reduce((sum, x) => sum + x, 0) / xs.length).toFixed(3)) : null
const results: Record<string, unknown> = {}
for (const name of FILES) {
  const outcomes = { compare: new Map<string, AuOutcome>(), uncertain: new Map<string, AuOutcome>() }
  for (const row of datasets[name]) {
    current = row.id
    for (const modelPolicy of ['compare', 'uncertain'] as const) {
      const result = await classifyAuPage({ ...row, page: 1 }, { backend, allowModelProcessing: true, modelPolicy, gate })
      outcomes[modelPolicy].set(row.id, result.documentType)
    }
  }
  const sent = datasets[name].filter(row => answers.has(row.id))
  const answer = (row: typeof sent[number]) => {
    const recorded = answers.get(row.id)!
    return { choice: recorded.answers.document?.choice, confidence: recorded.answers.document?.confidence, inputTokens: recorded.inputTokens }
  }
  const correct = sent.filter(row => answer(row).choice === row.label), wrong = sent.filter(row => answer(row).choice !== row.label)
  const modelOnly = { pages: sent.length, correct: correct.length, accuracy: sent.length ? Number((correct.length / sent.length).toFixed(3)) : null,
    correctAtGate: correct.filter(row => answer(row).confidence >= gate).length,
    wrongAtGate: wrong.filter(row => answer(row).confidence >= gate).length,
    meanConfidenceCorrect: mean(correct.map(row => answer(row).confidence)),
    meanConfidenceWrong: mean(wrong.map(row => answer(row).confidence)),
    pagesAtContextLimit: sent.filter(row => answer(row).inputTokens >= CONTEXT[model]).length,
    errors: wrong.map(row => ({ id: row.id, truth: row.label, choice: answer(row).choice, confidence: answer(row).confidence })) }
  const compare = evaluate(datasets[name], row => outcomes.compare.get(row.id)!)
  const uncertain = evaluate(datasets[name], row => outcomes.uncertain.get(row.id)!)
  results[name] = { compare, uncertain, modelOnly }
  console.log(`${name}: model ${modelOnly.correct}/${modelOnly.pages} raw (${modelOnly.wrongAtGate} wrong at or above the gate); ` +
    `pipeline compare ${compare.correct}/${compare.cases}, uncertain ${uncertain.correct}/${uncertain.cases}`)
}
const report = { schema: 'au-laya-evaluation-1', corpus: 'synthetic-development-holdout', hashes, measuredAt: new Date().toISOString(),
  checkpoint: model, gate, server: { url: values.url, ...health }, calls, elapsedMs: Date.now() - started, results }
await writeFile(new URL('./laya-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log('Every suggestion still requires review. Synthetic results do not establish field accuracy.')
