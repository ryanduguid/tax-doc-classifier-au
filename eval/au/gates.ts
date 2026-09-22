import { AU_TYPES } from '../../src/au/catalogue.js'

type Score = { cases: number; correct: number; perCategory: Record<string, { cases: number }> }
export function assertQualityGates(results: Record<string, { rules: Score }>): void {
  // Exact synthetic regressions must all pass; this is not a field-accuracy threshold.
  for (const [name, minimum] of Object.entries({ development: 15, 'held-out': 42, regression: 32, hardening: 20 })) {
    const score = results[name]?.rules
    if (!score || !Number.isSafeInteger(score.cases) || score.cases < minimum || score.correct !== score.cases) {
      throw new Error(`Quality gate failed: ${name} requires at least ${minimum} cases and zero classification errors.`)
    }
    if (['development', 'held-out'].includes(name) && AU_TYPES.some(type => !(score.perCategory[type]?.cases > 0))) {
      throw new Error(`Quality gate failed: ${name} is missing a document category.`)
    }
  }
}
