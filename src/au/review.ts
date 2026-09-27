import { AU_TAXONOMY_VERSION, AU_TYPES, type AuDocumentType } from './catalogue.js'
import type { AuOutcome, AuResult } from './classify.js'

/** One page's decision; `null` means the reviewer has not decided, which is never counted as accepted or unknown. */
export type ReviewDecision = { page: number; textSha256: string; suggested?: AuOutcome; decision: AuOutcome | null }
export type ReviewManifest = { schemaVersion: string; results: AuResult[] }
/** Bound to one manifest by its digest; the reviewer id is a pseudonym, never a name or email. */
export type ReviewDecisions = { schemaVersion: 'au-review-decisions-1'; manifestSha256: string; reviewer?: string; reviewedAt?: string; decisions: ReviewDecision[] }

const OUTCOMES: AuOutcome[] = [...AU_TYPES, 'unknown', 'ambiguous', 'unreadable']
const METHODS = ['rules', 'model', 'extraction'] as const
const named = (outcome: AuOutcome) => AU_TYPES.includes(outcome as AuDocumentType)
const sha256 = /^[a-f0-9]{64}$/
// Reasons are fixed identifiers; anything else could be text or a path from an edited manifest.
const identifier = /^[a-z_]{1,64}$/
const isoDate = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/

export function validateManifest(input: unknown): ReviewManifest {
  const m = input as ReviewManifest | null
  if (!m || m.schemaVersion !== 'au-review-1' || !Array.isArray(m.results) || !m.results.length || m.results.length > 500) {
    throw new Error('Supply a review manifest written by tax-doc-au (schema au-review-1).')
  }
  const pages = new Set<number>()
  for (const r of m.results) {
    if (!r || !Number.isSafeInteger(r.page) || r.page < 1 || pages.has(r.page) || !sha256.test(r.textSha256 ?? '') ||
        !OUTCOMES.includes(r.documentType) || !METHODS.includes(r.method) || !identifier.test(r.reason ?? '')) {
      throw new Error('Manifest results need unique pages with textSha256, documentType, method and a reason identifier.')
    }
    if (r.taxonomyVersion !== AU_TAXONOMY_VERSION) throw new Error(`Manifest results must use taxonomy ${AU_TAXONOMY_VERSION}.`)
    pages.add(r.page)
  }
  return m
}

/** A decisions file for the reviewer: every decision starts empty, with the suggestion beside it for reference. */
export function decisionTemplate(manifest: ReviewManifest, manifestSha256: string): ReviewDecisions {
  if (!sha256.test(manifestSha256)) throw new Error('manifestSha256 must be the hex SHA-256 of the manifest file.')
  return { schemaVersion: 'au-review-decisions-1', manifestSha256, reviewer: '', reviewedAt: '',
    decisions: manifest.results.map(r => ({ page: r.page, textSha256: r.textSha256, suggested: r.documentType, decision: null })) }
}

export function validateDecisions(input: unknown): ReviewDecisions {
  const d = input as ReviewDecisions | null
  if (!d || d.schemaVersion !== 'au-review-decisions-1' || !sha256.test(d.manifestSha256 ?? '') || !Array.isArray(d.decisions) ||
      !d.decisions.length || d.decisions.length > 500) {
    throw new Error('Supply a decisions file (schema au-review-decisions-1) with its manifestSha256 and 1 to 500 decisions.')
  }
  if ((d.reviewer !== undefined && (typeof d.reviewer !== 'string' || d.reviewer.length > 64 || /[@\s]/.test(d.reviewer))) ||
      (d.reviewedAt !== undefined && (typeof d.reviewedAt !== 'string' || (d.reviewedAt !== '' && (!isoDate.test(d.reviewedAt) || Number.isNaN(Date.parse(d.reviewedAt))))))) {
    throw new Error('reviewer must be a short pseudonym without spaces or @, and reviewedAt an ISO 8601 date such as 2026-09-27T10:00:00+10:00 or empty.')
  }
  const pages = new Set<number>()
  for (const x of d.decisions) {
    if (!x || !Number.isSafeInteger(x.page) || x.page < 1 || pages.has(x.page) || !sha256.test(x.textSha256 ?? '') ||
        (x.decision !== null && !OUTCOMES.includes(x.decision)) || (x.suggested !== undefined && !OUTCOMES.includes(x.suggested))) {
      throw new Error('Each decision needs a unique page, that page\'s textSha256 and a review outcome or null.')
    }
    pages.add(x.page)
  }
  return d
}

/** Compares reviewer decisions with the manifest's suggestions; carries hashes and labels, never text. */
export function summariseReview(manifest: ReviewManifest, decisions: ReviewDecisions, manifestSha256: string) {
  if (decisions.manifestSha256 !== manifestSha256) throw new Error('These decisions belong to a different manifest.')
  const byPage = new Map(manifest.results.map(r => [r.page, r]))
  const rows = decisions.decisions.map(d => {
    const r = byPage.get(d.page)
    if (!r) throw new Error(`Decision for page ${d.page} has no page in the manifest.`)
    if (r.textSha256 !== d.textSha256) throw new Error(`Decision for page ${d.page} was made on different text.`)
    return { page: d.page, textSha256: d.textSha256, suggested: r.documentType, method: r.method, confidence: r.confidence, reason: r.reason, decision: d.decision }
  })
  const reviewed = rows.filter((x): x is typeof x & { decision: AuOutcome } => x.decision !== null)
  const accepted = (subset: typeof reviewed) => subset.filter(x => x.decision === x.suggested).length
  const methods = Object.fromEntries(METHODS.map(method => {
    const subset = reviewed.filter(x => x.method === method)
    return [method, { pages: subset.length, accepted: accepted(subset) }]
  }))
  const perCategory = Object.fromEntries(AU_TYPES.map(type => {
    const suggested = reviewed.filter(x => x.suggested === type), decided = reviewed.filter(x => x.decision === type)
    const correct = suggested.filter(x => x.decision === type).length
    return [type, { suggested: suggested.length, decided: decided.length, correct,
      precision: suggested.length ? correct / suggested.length : null, recall: decided.length ? correct / decided.length : null }]
  }))
  return {
    schema: 'au-review-summary-1',
    manifestSha256,
    taxonomyVersion: AU_TAXONOMY_VERSION,
    reviewer: decisions.reviewer || null,
    reviewedAt: decisions.reviewedAt || null,
    // The reviewer saw each suggestion while deciding, so acceptance is agreement, not independent truth.
    suggestionsVisible: true,
    pages: manifest.results.length,
    reviewed: reviewed.length,
    notReviewed: manifest.results.length - reviewed.length,
    accepted: accepted(reviewed),
    // A named suggestion the reviewer set to unknown, ambiguous or unreadable.
    falseSuggestions: reviewed.filter(x => named(x.suggested) && !named(x.decision)).length,
    // A named suggestion the reviewer replaced with a different category.
    changedCategory: reviewed.filter(x => named(x.suggested) && named(x.decision) && x.decision !== x.suggested).length,
    // A named decision where the pipeline had left the page unknown or ambiguous: what a model could recover.
    missedByPipeline: reviewed.filter(x => ['unknown', 'ambiguous'].includes(x.suggested) && named(x.decision)).length,
    // A named decision on a page the pipeline could not read: an extraction gap, not a classification miss.
    unreadableButNamed: reviewed.filter(x => x.suggested === 'unreadable' && named(x.decision)).length,
    methods,
    perCategory,
    labels: reviewed,
  }
}
