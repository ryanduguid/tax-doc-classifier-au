import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { AU_TYPES, type AuOutcome, type AuPage } from '../../src/au/index.js'

export type Case = Omit<AuPage, 'page'> & { id: string; group: string; label: AuOutcome }
export const FILES = ['development', 'held-out', 'regression', 'hardening'] as const
const OUTCOMES: AuOutcome[] = [...AU_TYPES, 'unknown', 'ambiguous', 'unreadable']

export async function loadCorpus(): Promise<{ datasets: Record<string, Case[]>; hashes: Record<string, string> }> {
  const datasets: Record<string, Case[]> = {}
  const hashes: Record<string, string> = {}
  const ids = new Set<string>(), groups = new Set<string>(), texts = new Set<string>()
  for (const name of FILES) {
    const raw = await readFile(new URL(`./${name}.json`, import.meta.url), 'utf8')
    hashes[name] = createHash('sha256').update(raw).digest('hex')
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
