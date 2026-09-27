import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { AU_TYPES, LAYA_DEFAULT_URL, LAYA_MODELS, classifyAuPage, classifyAuRules, layaBackend, localLayaUrl,
  type AskResult, type AuOutcome, type Backend, type LayaModel } from '../../src/au/index.js'
import { validAnswer } from '../../src/au/classify.js'
import { FILES, evaluate, loadCorpus, type Case } from './corpus.js'

// Measures a local Laya server on the synthetic corpus. Run laya-serve first; nothing leaves this machine.
const { values } = parseArgs({ options: {
  model: { type: 'string', default: LAYA_MODELS[0] }, url: { type: 'string', default: LAYA_DEFAULT_URL }, gate: { type: 'string', default: '0.95' },
} })
const model = values.model as LayaModel
if (!LAYA_MODELS.includes(model)) throw new Error(`--model must be one of ${LAYA_MODELS.join(', ')}`)
const gate = Number(values.gate)
const url = localLayaUrl(values.url)
const health = await (await fetch(`${url}/health`, { redirect: 'error' })).json() as { device?: string; loaded?: string[] }
const revision = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return null } })()

// One server request per page, shared by both policy passes, whether it succeeded or failed.
const requests = new Map<string, Promise<AskResult>>()
let current = ''
const server = layaBackend({ baseUrl: url, model })
const backend: Backend = { ask(state, questions) {
  let pending = requests.get(current)
  if (!pending) {
    pending = server.ask(state, questions)
    requests.set(current, pending)
  }
  return pending
} }

const named = (outcome: AuOutcome) => AU_TYPES.includes(outcome as typeof AU_TYPES[number])
// How a policy changed the rules-only outcome, judged against the truth label.
function transitions(cases: Case[], rules: Map<string, AuOutcome>, policy: Map<string, AuOutcome>) {
  const count = (test: (row: Case) => boolean) => cases.filter(test).length
  const of = (m: Map<string, AuOutcome>, row: Case) => m.get(row.id)!
  return {
    retained: count(row => of(policy, row) === of(rules, row)),
    recovered: count(row => of(rules, row) !== row.label && of(policy, row) === row.label),
    degraded: count(row => of(rules, row) === row.label && of(policy, row) !== row.label),
    falseSuggestions: count(row => !named(row.label) && named(of(policy, row))),
  }
}

const { datasets, hashes } = await loadCorpus()
const started = Date.now()
const mean = (xs: number[]) => xs.length ? Number((xs.reduce((sum, x) => sum + x, 0) / xs.length).toFixed(3)) : null
const results: Record<string, unknown> = {}
for (const name of FILES) {
  const rules = new Map<string, AuOutcome>()
  const outcomes = { compare: new Map<string, AuOutcome>(), uncertain: new Map<string, AuOutcome>() }
  for (const row of datasets[name]) {
    current = row.id
    rules.set(row.id, classifyAuRules({ ...row, page: 1 }).documentType)
    for (const modelPolicy of ['compare', 'uncertain'] as const) {
      const result = await classifyAuPage({ ...row, page: 1 }, { backend, allowModelProcessing: true, modelPolicy, gate })
      outcomes[modelPolicy].set(row.id, result.documentType)
    }
  }
  const settled = await Promise.all(datasets[name].filter(row => requests.has(row.id))
    .map(async row => ({ row, result: await requests.get(row.id)!.then(r => r, () => null) })))
  const failed = settled.filter(s => !s.result).map(s => s.row.id)
  const invalid = settled.filter(s => s.result && !validAnswer(s.result.answers.document)).map(s => s.row.id)
  const valid = settled.filter((s): s is { row: Case; result: AskResult } => Boolean(s.result) && validAnswer(s.result!.answers.document))
  const answer = (s: { result: AskResult }) => s.result.answers.document
  const correct = valid.filter(s => answer(s).choice === s.row.label), wrong = valid.filter(s => answer(s).choice !== s.row.label)
  const modelOnly = { pagesSent: settled.length, failed, invalid, valid: valid.length, correct: correct.length,
    accuracy: valid.length ? Number((correct.length / valid.length).toFixed(3)) : null,
    correctAtGate: correct.filter(s => answer(s).confidence >= gate).length,
    wrongAtGate: wrong.filter(s => answer(s).confidence >= gate).length,
    meanConfidenceCorrect: mean(correct.map(s => answer(s).confidence)),
    meanConfidenceWrong: mean(wrong.map(s => answer(s).confidence)),
    truncated: valid.filter(s => s.result.truncated).length,
    errors: wrong.map(s => ({ id: s.row.id, truth: s.row.label, choice: answer(s).choice, confidence: answer(s).confidence })) }
  const compare = { ...evaluate(datasets[name], row => outcomes.compare.get(row.id)!), transitions: transitions(datasets[name], rules, outcomes.compare) }
  const uncertain = { ...evaluate(datasets[name], row => outcomes.uncertain.get(row.id)!), transitions: transitions(datasets[name], rules, outcomes.uncertain) }
  results[name] = { compare, uncertain, modelOnly }
  console.log(`${name}: model ${modelOnly.correct}/${modelOnly.valid} valid answers right (${modelOnly.wrongAtGate} wrong at or above the gate, ` +
    `${failed.length} failed, ${invalid.length} invalid); pipeline compare ${compare.correct}/${compare.cases}, uncertain ${uncertain.correct}/${uncertain.cases} ` +
    `(${uncertain.transitions.falseSuggestions} false suggestions, ${uncertain.transitions.recovered} recovered)`)
}
const report = { schema: 'au-laya-evaluation-2', corpus: 'synthetic-development-holdout', hashes, revision, measuredAt: new Date().toISOString(),
  checkpoint: model, gate, server: { url, device: health.device ?? null, loaded: health.loaded ?? null }, calls: requests.size,
  elapsedMs: Date.now() - started, results }
await writeFile(new URL('./laya-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log('Every suggestion still requires review. Synthetic results do not establish field accuracy.')
