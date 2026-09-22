import { expect, it } from 'vitest'
import { AU_TYPES } from '../../src/au/catalogue.js'
import { assertQualityGates } from './gates.js'

const passing = () => Object.fromEntries(Object.entries({ development: 15, 'held-out': 42, regression: 32, hardening: 20 }).map(([name, cases]) =>
  [name, { rules: { cases, correct: cases, perCategory: Object.fromEntries(AU_TYPES.map(type => [type, { cases: 1 }])) } }]))
it('accepts complete passing regression reports', () => expect(() => assertQualityGates(passing())).not.toThrow())
it('rejects incorrect predictions independently of the saved result file', () => {
  const report = passing()
  report['held-out'].rules.correct--
  expect(() => assertQualityGates(report)).toThrow('zero classification errors')
})
it('rejects missing categories and shrunken datasets', () => {
  const report = passing()
  delete report.development.rules.perCategory['tax-invoice']
  expect(() => assertQualityGates(report)).toThrow('missing a document category')
  expect(() => assertQualityGates({})).toThrow('Quality gate failed')
  report.development.rules.cases = report.development.rules.correct = 0
  expect(() => assertQualityGates(report)).toThrow('at least 15')
})
