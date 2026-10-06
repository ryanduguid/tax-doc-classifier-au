import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { AU_TYPES, type AuOutcome, type AuPage } from '../../src/au/index.js'

export type Case = Omit<AuPage, 'page'> & { id: string; group: string; label: AuOutcome }
export const FILES = ['development', 'held-out', 'regression', 'hardening'] as const
const OUTCOMES: AuOutcome[] = [...AU_TYPES, 'unknown', 'ambiguous', 'unreadable']
// Original fixtures committed before the classifier at 6e57d85. Add later cases to the development regression sets.
const ORIGINAL_HASHES: Record<string, string> = {
  development: 'cdb8cfa78d6df8d5a49c01d2d0d51272fe11c3bbf6b0843f3cb154e0e9f40fa9',
  'held-out': '96e115e6d3d3e63747b8a09cceaddfb4c6e500b9ca47a79e64786990ed094827',
}

export async function loadCorpus(directory = new URL('./', import.meta.url)): Promise<{ datasets: Record<string, Case[]>; hashes: Record<string, string> }> {
  const datasets: Record<string, Case[]> = {}
  const hashes: Record<string, string> = {}
  const ids = new Set<string>(), groups = new Set<string>(), texts = new Set<string>()
  for (const name of FILES) {
    const raw = await readFile(new URL(`${name}.json`, directory), 'utf8')
    hashes[name] = createHash('sha256').update(raw).digest('hex')
    if (ORIGINAL_HASHES[name] && hashes[name] !== ORIGINAL_HASHES[name]) {
      throw new Error(`Original ${name} corpus changed. Restore the original file and add development cases to regression.json or hardening.json.`)
    }
    datasets[name] = JSON.parse(raw)
    for (const row of datasets[name]) {
      if (ids.has(row.id) || groups.has(row.group) || texts.has(row.text)) throw new Error('Duplicate fixture, layout group or text across corpus')
      if (!OUTCOMES.includes(row.label)) throw new Error('Invalid truth label')
      ids.add(row.id); groups.add(row.group); texts.add(row.text)
    }
  }
  return { datasets, hashes }
}

export function evaluate(cases: Case[], predict: (row: Case) => AuOutcome) {
  const rows = cases.map(row => ({ id: row.id, truth: row.label, prediction: predict(row) }))
  const perCategory = Object.fromEntries(OUTCOMES.map(label => {
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
