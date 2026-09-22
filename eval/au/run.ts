import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { AU_TYPES, classifyAuRules, type AuPage, type AuOutcome } from '../../src/au/index.js'

type Case = Omit<AuPage, 'page'> & { id: string; group: string; label: AuOutcome }
const files = ['development', 'held-out'] as const
const datasets: Record<string, Case[]> = {}
const hashes: Record<string, string> = {}
const ids = new Set<string>(), groups = new Set<string>(), texts = new Set<string>()
for (const name of files) {
  const raw = await readFile(new URL(`./${name}.json`, import.meta.url), 'utf8')
  hashes[name] = createHash('sha256').update(raw).digest('hex')
  datasets[name] = JSON.parse(raw)
  for (const row of datasets[name]) {
    if (ids.has(row.id) || groups.has(row.group) || texts.has(row.text)) throw new Error('Duplicate fixture, layout group or text across corpus')
    if (![...AU_TYPES, 'unknown', 'ambiguous', 'unreadable'].includes(row.label)) throw new Error('Invalid truth label')
    ids.add(row.id); groups.add(row.group); texts.add(row.text)
  }
}

function evaluate(cases: Case[], predict: (row: Case) => AuOutcome) {
  const rows = cases.map(row => ({ id: row.id, truth: row.label, prediction: predict(row) }))
  const perCategory = Object.fromEntries([...AU_TYPES, 'unknown', 'ambiguous', 'unreadable'].map(label => {
    const actual = rows.filter(r => r.truth === label), proposed = rows.filter(r => r.prediction === label)
    const correct = actual.filter(r => r.prediction === label).length
    return [label, { cases: actual.length, correct, recall: actual.length ? correct / actual.length : null,
      precision: proposed.length ? correct / proposed.length : null }]
  }))
  const errors = rows.filter(r => r.truth !== r.prediction)
  const known = cases.filter(r => AU_TYPES.includes(r.label as typeof AU_TYPES[number]))
  const suggestions = rows.filter(r => AU_TYPES.includes(r.prediction as typeof AU_TYPES[number]))
  return { cases: rows.length, correct: rows.length - errors.length, accuracy: (rows.length - errors.length) / rows.length,
    knownCases: known.length, suggestions: suggestions.length, suggestionCoverage: suggestions.length / rows.length,
    suggestionPrecision: suggestions.length ? suggestions.filter(r => r.truth === r.prediction).length / suggestions.length : null,
    perCategory, errors }
}

// Deliberately simple comparison: a category name appearing anywhere on the page.
function keyword(row: Case): AuOutcome {
  if (!row.text.trim() || row.extraction === 'needs_ocr' || row.extraction === 'failed') return 'unreadable'
  return AU_TYPES.find(type => row.text.toLowerCase().includes(type.replaceAll('-', ' '))) ?? 'unknown'
}
const results = Object.fromEntries(files.map(name => [name, {
  rules: evaluate(datasets[name], row => classifyAuRules({ ...row, page: 1 }).documentType),
  keywordBaseline: evaluate(datasets[name], keyword),
}]))
const report = { schema: 'au-evaluation-1', corpus: 'synthetic-development-holdout', hashes,
  modelEvaluated: false, reviewRate: 1, automatedCoverage: 0, automaticErrorRate: null,
  measuredTimeSaved: null, results }
await writeFile(new URL('./results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
for (const name of files) {
  const r = results[name]
  console.log(`${name}: rules ${r.rules.correct}/${r.rules.cases}; keyword baseline ${r.keywordBaseline.correct}/${r.keywordBaseline.cases}`)
  console.log(`Errors: ${JSON.stringify(r.rules.errors)}`)
}
console.log('All suggestions require review. Automatic coverage 0%; field accuracy and time saved are unmeasured.')
