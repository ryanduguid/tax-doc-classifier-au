import { afterEach, describe, expect, it, vi } from 'vitest'
import { jevBackend, layaBackend, type ChoiceQuestion } from './backend.js'

const question: Record<string, ChoiceQuestion> = { document: { type: 'choice', instructions: 'Classify.', criteria: {
  'tax-invoice': { what: 'Tax invoice.', not_for: 'Quotes.' }, unknown: { what: 'Anything else.', examples: ['letter'] } } } }
const layaReply = { model: 'laya-rl-agent', routing: { model: 'multilingual' }, usage: { input_tokens: 57, output_tokens: 0 },
  answers: { document: { type: 'choice', choice: 'tax-invoice', confidence: 0.41, answer_confidence: 0.83,
    probabilities: { 'tax-invoice': 0.83, unknown: 0.17 }, action: { act_probability: 1 } } } }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => { fetchMock.mockReset(); vi.useRealTimers(); vi.unstubAllEnvs() })

describe('Laya backend', () => {
  it('sends short criteria and the checkpoint, omits the bearer token and maps the calibrated confidence', async () => {
    vi.stubEnv('LAYA_API_KEY', '')
    fetchMock.mockResolvedValueOnce(reply(200, layaReply))
    const result = await layaBackend({ baseUrl: 'http://127.0.0.1:8000/' }).ask({ page: 1, text: 'Tax invoice' }, question)
    expect(result).toEqual({ answers: { document: { choice: 'tax-invoice', confidence: 0.83, probabilities: { 'tax-invoice': 0.83, unknown: 0.17 } } }, inputTokens: 57, truncated: false })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8000/v1/systemone')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.redirect).toBe('error')
    expect(JSON.parse(init.body)).toEqual({ model: 'typed-decisions', state: { page: 1, text: 'Tax invoice' },
      questions: { document: { type: 'choice', instructions: 'Classify.', criteria: { 'tax-invoice': 'Tax invoice.', unknown: 'Anything else.' } } } })
  })
  it('sends a bearer token and a chosen checkpoint when supplied', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, layaReply))
    await layaBackend({ apiKey: 'k', model: 'english' }).ask('text', question)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8000/v1/systemone')
    expect(init.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body).model).toBe('english')
  })
  it('rejects unknown checkpoints', () => {
    expect(() => layaBackend({ model: 'other' as never })).toThrow('checkpoint')
  })
  it('does not retry a rejected request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('question document: bad criteria', { status: 422 }))
    await expect(layaBackend().ask('text', question)).rejects.toThrow('Laya HTTP 422')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('retries a server error after a delay', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(new Response('inference failed', { status: 500 })).mockResolvedValueOnce(reply(200, layaReply))
    const pending = layaBackend({ retries: 2 }).ask('text', question)
    await vi.advanceTimersByTimeAsync(1500)
    expect((await pending).inputTokens).toBe(57)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('passes malformed answers through for the caller to reject', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { answers: { document: 'bad' } }))
    expect(await layaBackend().ask('text', question)).toEqual({ answers: { document: 'bad' }, inputTokens: 0, truncated: false })
  })
  it('flags a page the server cut to its context limit', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ...layaReply, usage: { input_tokens: 1024, output_tokens: 0 } }))
    expect((await layaBackend().ask('text', question)).truncated).toBe(true)
    fetchMock.mockResolvedValueOnce(reply(200, { ...layaReply, usage: { input_tokens: 512, output_tokens: 0 } }))
    expect((await layaBackend({ model: 'english' }).ask('text', question)).truncated).toBe(true)
  })
  it('retries when the body cannot be read', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.reject(new Error('socket closed')) })
      .mockResolvedValueOnce(reply(200, layaReply))
    const pending = layaBackend({ retries: 2 }).ask('text', question)
    await vi.advanceTimersByTimeAsync(1500)
    expect((await pending).inputTokens).toBe(57)
  })
  it.each([{ retries: 0 }, { retries: 1.5 }, { retries: NaN }, { timeoutMs: 0 }, { timeoutMs: -1 }])('rejects invalid options %o', opts => {
    expect(() => layaBackend(opts)).toThrow(/retries|timeoutMs/)
  })
})

describe('Jev backend', () => {
  it('requires a key and keeps the full criteria and answers', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    expect(() => jevBackend()).toThrow('TYPESAFE_API_KEY')
    const answer = { choice: 'unknown', confidence: 0.6, probabilities: { 'tax-invoice': 0.4, unknown: 0.6 } }
    fetchMock.mockResolvedValueOnce(reply(200, { answers: { document: answer }, usage: { input_tokens: 9 } }))
    expect(await jevBackend({ apiKey: 'k' }).ask('text', question)).toEqual({ answers: { document: answer }, inputTokens: 9 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body)).toEqual({ model: 'jev-latest', state: 'text', questions: question })
  })
  it('stops on payment required', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 402 }))
    await expect(jevBackend({ apiKey: 'k' }).ask('text', question)).rejects.toThrow('payment required (402)')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
