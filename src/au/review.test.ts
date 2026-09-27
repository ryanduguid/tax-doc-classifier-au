import { describe, expect, it } from 'vitest'
import type { AuResult } from './classify.js'
import { decisionTemplate, summariseReview, validateDecisions, validateManifest, type ReviewDecisions } from './review.js'

const hash = (n: number) => n.toString(16).padStart(64, '0')
const digest = hash(0xabc)
const result = (page: number, documentType: AuResult['documentType'], method: AuResult['method'] = 'rules', confidence: number | null = null): AuResult => ({
  page, taxonomyVersion: 'au-1', documentType, candidates: [], method, confidence, requiresReview: true, reason: 'rule_suggestion',
  extraction: 'native', ocrEngine: null, warnings: [], evidence: [], textSha256: hash(page), calls: 0, inputTokens: 0 })
const manifest = { schemaVersion: 'au-review-1', results: [
  result(1, 'tax-invoice'), result(2, 'receipt', 'model', 0.97), result(3, 'unknown'), result(4, 'unreadable', 'extraction'),
  result(5, 'bank-statement'), result(6, 'dividend-statement'), result(7, 'unreadable', 'extraction') ] }
const decided = (decisions: ReviewDecisions['decisions'], extra: Partial<ReviewDecisions> = {}): ReviewDecisions =>
  ({ schemaVersion: 'au-review-decisions-1', manifestSha256: digest, decisions, ...extra })

describe('review decisions', () => {
  it('drafts a template with empty decisions and the suggestion beside each', () => {
    const template = decisionTemplate(validateManifest(manifest), digest)
    expect(template).toMatchObject({ schemaVersion: 'au-review-decisions-1', manifestSha256: digest, reviewer: '', reviewedAt: '' })
    expect(template.decisions.slice(0, 3).map(d => [d.page, d.suggested, d.decision])).toEqual([[1, 'tax-invoice', null], [2, 'receipt', null], [3, 'unknown', null]])
    expect(JSON.stringify(template)).not.toContain('"text"')
    expect(() => decisionTemplate(manifest, 'nope')).toThrow('manifestSha256')
  })
  it('measures acceptance, rejected and changed suggestions, missed pages and pages left undecided', () => {
    const decisions = validateDecisions(decided([
      { page: 1, textSha256: hash(1), decision: 'tax-invoice' }, { page: 2, textSha256: hash(2), decision: 'unknown' },
      { page: 3, textSha256: hash(3), decision: 'loan-statement' }, { page: 4, textSha256: hash(4), decision: 'unreadable' },
      { page: 5, textSha256: hash(5), suggested: 'bank-statement', decision: null }, { page: 6, textSha256: hash(6), decision: 'managed-fund-statement' },
      { page: 7, textSha256: hash(7), decision: 'receipt' } ], { reviewer: 'r1', reviewedAt: '2026-09-27T10:00:00+10:00' }))
    const summary = summariseReview(validateManifest(manifest), decisions, digest)
    expect(summary).toMatchObject({ manifestSha256: digest, taxonomyVersion: 'au-1', reviewer: 'r1', suggestionsVisible: true,
      pages: 7, reviewed: 6, notReviewed: 1, accepted: 2, falseSuggestions: 1, changedCategory: 1, missedByPipeline: 1, unreadableButNamed: 1,
      methods: { rules: { pages: 3, accepted: 1 }, model: { pages: 1, accepted: 0 }, extraction: { pages: 2, accepted: 1 } } })
    expect(summary.perCategory['tax-invoice']).toMatchObject({ suggested: 1, decided: 1, correct: 1, precision: 1, recall: 1 })
    expect(summary.perCategory.receipt).toMatchObject({ suggested: 1, decided: 1, correct: 0, precision: 0, recall: 0 })
    expect(summary.perCategory['dividend-statement']).toMatchObject({ suggested: 1, decided: 0, correct: 0, precision: 0, recall: null })
    expect(summary.labels).toHaveLength(6)
    expect(summary.labels[1]).toMatchObject({ page: 2, textSha256: hash(2), suggested: 'receipt', method: 'model', confidence: 0.97, reason: 'rule_suggestion', decision: 'unknown' })
  })
  it('refuses decisions for another manifest, different text or an unknown page', () => {
    const m = validateManifest(manifest)
    expect(() => summariseReview(m, decided([{ page: 1, textSha256: hash(1), decision: 'tax-invoice' }], { manifestSha256: hash(1) }), digest)).toThrow('different manifest')
    expect(() => summariseReview(m, decided([{ page: 1, textSha256: hash(9), decision: 'tax-invoice' }]), digest)).toThrow('different text')
    expect(() => summariseReview(m, decided([{ page: 9, textSha256: hash(9), decision: 'tax-invoice' }]), digest)).toThrow('no page')
  })
  it.each([null, {}, decided([]), { ...decided([{ page: 1, textSha256: hash(1), decision: 'receipt' }]), manifestSha256: 'x' },
    decided([{ page: 1, textSha256: 'short', decision: 'receipt' }]),
    decided([{ page: 1, textSha256: hash(1), decision: 'invented' as never }]),
    decided([{ page: 1, textSha256: hash(1), decision: 'receipt' }, { page: 1, textSha256: hash(1), decision: 'receipt' }]),
    decided([{ page: 1, textSha256: hash(1), decision: 'receipt' }], { reviewer: 'someone@example.com' }),
    decided([{ page: 1, textSha256: hash(1), decision: 'receipt' }], { reviewedAt: 'yesterday' }),
    decided([{ page: 1, textSha256: hash(1), decision: 'receipt' }], { reviewedAt: 'September 27, 2026' }),
    decided([{ page: 1, textSha256: hash(1), decision: 'receipt' }], { reviewedAt: '2026-13-45' }),
  ])('rejects malformed decisions', input => {
    expect(() => validateDecisions(input)).toThrow()
  })
  it.each(['2026-09-27', '2026-09-27T10:00Z', '2026-09-27T10:00:00.123+10:00', ''])('accepts ISO 8601 review dates', reviewedAt => {
    expect(validateDecisions(decided([{ page: 1, textSha256: hash(1), decision: 'receipt' }], { reviewedAt })).reviewedAt).toBe(reviewedAt)
  })
  it.each([null, { schemaVersion: 'au-review-2', results: [] },
    { schemaVersion: 'au-review-1', results: [{ ...result(1, 'receipt'), textSha256: 'x' }] },
    { schemaVersion: 'au-review-1', results: [{ ...result(1, 'receipt'), taxonomyVersion: 'au-0' }] },
    { schemaVersion: 'au-review-1', results: [{ ...result(1, 'receipt'), reason: 'C:/private/path or text' }] },
  ])('rejects malformed manifests', input => {
    expect(() => validateManifest(input)).toThrow()
  })
})
