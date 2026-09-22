import { describe, expect, it, vi } from 'vitest'
import type { Backend, ChoiceAnswer } from '../backend.js'
import { AU_TYPES } from './catalogue.js'
import { classifyAuPage, classifyAuRules, type AuPage } from './classify.js'
import { validatePages } from './input.js'

const invoice: AuPage = { page: 1, text: 'Tax invoice\nGST 10\nTotal due 110', extraction: 'native' }
function answer(choice = 'tax-invoice', confidence = 0.98): ChoiceAnswer {
  const keys = [...AU_TYPES, 'unknown', 'ambiguous']
  return { choice, confidence, probabilities: Object.fromEntries(keys.map(k => [k, k === choice ? confidence : (1 - confidence) / (keys.length - 1)])) }
}
function backend(a: unknown): Backend {
  return { ask: vi.fn(async () => ({ answers: { document: a as ChoiceAnswer }, inputTokens: 100 })) }
}
const authorised = (b: Backend) => ({ backend: b, allowModelProcessing: true })

describe('Australian review contract', () => {
  it('recognises sparse evidence without treating it as blank or assigning invented confidence', () => {
    expect(classifyAuRules(invoice)).toMatchObject({ documentType: 'tax-invoice', confidence: null, requiresReview: true })
  })
  it.each(['', '  \n'])('routes missing extraction for review', text => {
    expect(classifyAuRules({ ...invoice, text }).documentType).toBe('unreadable')
  })
  it.each(['needs_ocr', 'failed'] as const)('does not classify extraction marked %s', extraction => {
    expect(classifyAuRules({ ...invoice, extraction }).documentType).toBe('unreadable')
  })
  it('preserves OCR warnings and prevents a model call', async () => {
    const b = backend(answer())
    expect(await classifyAuPage({ ...invoice, extraction: 'ocr', warnings: ['low confidence'] }, authorised(b)))
      .toMatchObject({ documentType: 'unreadable', warnings: ['low confidence'], calls: 0 })
    expect(b.ask).not.toHaveBeenCalled()
  })
  it('returns ambiguous for a combined paid invoice and receipt', () => {
    const r = classifyAuRules({ ...invoice, text: invoice.text + '\nPayment receipt\nPaid by card' })
    expect(r.documentType).toBe('ambiguous')
    expect(r.candidates).toEqual(['tax-invoice', 'receipt'])
  })
  it.each(['Instructions for completing a tax invoice\nGST and total due', 'Please send a tax invoice\nGST and total due'])('does not classify instructions as the referenced document', text => {
    expect(classifyAuRules({ ...invoice, text }).documentType).toBe('unknown')
  })
  it('does not leak document contents into its manifest', () => {
    const r = classifyAuRules({ ...invoice, text: invoice.text + '\nSYNTHETIC_PERSON_MARKER' })
    expect(JSON.stringify(r)).not.toContain('SYNTHETIC_PERSON_MARKER')
    expect(r.textSha256).toMatch(/^[a-f0-9]{64}$/)
  })
  it('requires authorisation before model processing', async () => {
    const b = backend(answer())
    await expect(classifyAuPage(invoice, { backend: b })).rejects.toThrow('authorisation')
    expect(b.ask).not.toHaveBeenCalled()
  })
  it('preserves a high-confidence unknown answer', async () => {
    const r = await classifyAuPage(invoice, authorised(backend(answer('unknown'))))
    expect(r).toMatchObject({ documentType: 'unknown', confidence: 0.98, requiresReview: true })
  })
  it('keeps confident model suggestions subject to review', async () => {
    expect(await classifyAuPage(invoice, authorised(backend(answer()))))
      .toMatchObject({ documentType: 'tax-invoice', requiresReview: true, calls: 1, inputTokens: 100 })
  })
  it('abstains below the gate', async () => {
    expect(await classifyAuPage(invoice, authorised(backend(answer('tax-invoice', 0.7)))))
      .toMatchObject({ documentType: 'unknown', reason: 'below_model_gate' })
  })
  it('surfaces disagreement rather than overriding evidence', async () => {
    expect(await classifyAuPage(invoice, authorised(backend(answer('receipt')))))
      .toMatchObject({ documentType: 'ambiguous', reason: 'model_rule_disagreement' })
  })
  it.each([null, {}, { choice: 'invented', confidence: 1, probabilities: { invented: 1 } },
    { ...answer(), confidence: NaN }, { ...answer(), probabilities: { 'tax-invoice': 1 } },
    { ...answer(), confidence: 0.5 }, { ...answer(), probabilities: { ...answer().probabilities, receipt: -1 } }])('rejects malformed model responses', async a => {
    expect(await classifyAuPage(invoice, authorised(backend(a))))
      .toMatchObject({ documentType: 'unknown', reason: 'invalid_model_response' })
  })
  it('does not echo provider errors', async () => {
    const b: Backend = { ask: async () => { throw new Error('SYNTHETIC_PRIVATE_MARKER') } }
    const r = await classifyAuPage(invoice, authorised(b))
    expect(r.reason).toBe('model_unavailable')
    expect(JSON.stringify(r)).not.toContain('SYNTHETIC_PRIVATE_MARKER')
  })
  it('does not silently truncate long model inputs', async () => {
    const b = backend(answer())
    expect((await classifyAuPage({ ...invoice, text: 'x'.repeat(20_001) }, authorised(b))).reason).toBe('model_input_too_long')
    expect(b.ask).not.toHaveBeenCalled()
  })
  it.each([0, -1, 1.1, NaN])('rejects invalid gates', async gate => {
    await expect(classifyAuPage(invoice, { gate })).rejects.toThrow('gate')
  })
  it('rejects ties even with a permissive experimental threshold', async () => {
    const a = answer('unknown', 0.5)
    for (const key of Object.keys(a.probabilities)) a.probabilities[key] = 0
    a.probabilities.unknown = 0.5
    a.probabilities['tax-invoice'] = 0.5
    expect((await classifyAuPage(invoice, { ...authorised(backend(a)), gate: 0.4 })).reason).toBe('tied_model_choices')
  })
  it('validates input ordering and structure before processing', () => {
    expect(() => validatePages([invoice, invoice])).toThrow('unique')
    expect(() => validatePages([{ ...invoice, page: 0 }])).toThrow('Invalid page')
    expect(() => validatePages([{ ...invoice, warnings: 'bad' }])).toThrow('Invalid page')
    expect(() => validatePages([])).toThrow('between')
    expect(validatePages([invoice, { ...invoice, page: 4 }]).map(p => p.page)).toEqual([1, 4])
  })
})
