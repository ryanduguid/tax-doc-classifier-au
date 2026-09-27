import { writeFile } from 'node:fs/promises'
import { AU_TYPES, classifyAuRules, type AuOutcome } from '../../src/au/index.js'
import { FILES, evaluate, loadCorpus, type Case } from './corpus.js'
import { assertQualityGates } from './gates.js'

const { datasets, hashes } = await loadCorpus()

// Deliberately simple comparison: a category name appearing anywhere on the page.
function keyword(row: Case): AuOutcome {
  if (!row.text.trim() || row.extraction === 'needs_ocr' || row.extraction === 'failed') return 'unreadable'
  return AU_TYPES.find(type => row.text.toLowerCase().includes(type.replaceAll('-', ' '))) ?? 'unknown'
}
const results = Object.fromEntries(FILES.map(name => [name, {
  rules: evaluate(datasets[name], row => classifyAuRules({ ...row, page: 1 }).documentType),
  keywordBaseline: evaluate(datasets[name], keyword),
}]))
const report = { schema: 'au-evaluation-1', corpus: 'synthetic-development-holdout', hashes,
  modelEvaluated: false, reviewRate: 1, automatedCoverage: 0, automaticErrorRate: null,
  measuredTimeSaved: null, results }
await writeFile(new URL('./results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
for (const name of FILES) {
  const r = results[name]
  console.log(`${name}: rules ${r.rules.correct}/${r.rules.cases}; keyword baseline ${r.keywordBaseline.correct}/${r.keywordBaseline.cases}`)
  console.log(`Errors: ${JSON.stringify(r.rules.errors)}`)
}
console.log('All suggestions require review. Automatic coverage 0%; field accuracy and time saved are unmeasured.')
assertQualityGates(results)
console.log('Quality gates PASS: complete category coverage and zero synthetic regression errors.')
