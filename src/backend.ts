export type Criterion = { what: string; examples?: string[]; not_for?: string }
export type ChoiceQuestion = { type: 'choice'; instructions: string; criteria: Record<string, Criterion> }
export type ChoiceAnswer = { choice: string; confidence: number; probabilities: Record<string, number> }
export type AskResult = { answers: Record<string, ChoiceAnswer>; inputTokens: number }

export interface Backend {
  ask(state: unknown, questions: Record<string, ChoiceQuestion>): Promise<AskResult>
}

export type JevOptions = {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
  retries?: number
}

// typed-decisions first: fewest confident errors on unresolved pages in the synthetic evaluation.
export const LAYA_MODELS = ['typed-decisions', 'multilingual', 'english'] as const
export type LayaModel = (typeof LAYA_MODELS)[number]
/** A self-hosted `laya-serve` process. It speaks the same `/v1/systemone` protocol as Jev. */
export type LayaOptions = Omit<JevOptions, 'model'> & { model?: LayaModel }
export const LAYA_DEFAULT_URL = 'http://127.0.0.1:8000'

type Provider = {
  name: string
  url: string
  apiKey?: string
  model: string
  timeoutMs: number
  retries: number
  criteria: (criteria: Record<string, Criterion>) => unknown
  answer: (answer: unknown) => unknown
}

// Both providers accept {model, state, questions} and return {answers, usage}.
function systemOneBackend(p: Provider): Backend {
  const url = `${p.url.replace(/\/+$/, '')}/v1/systemone`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`
  return {
    async ask(state, questions) {
      const wire = Object.fromEntries(Object.entries(questions).map(([key, q]) => [key, { ...q, criteria: p.criteria(q.criteria) }]))
      const body = JSON.stringify({ model: p.model, state, questions: wire })
      let lastErr: unknown
      for (let attempt = 0; attempt < p.retries; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt))
        let res: Response
        try {
          res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(p.timeoutMs) })
        } catch (err) {
          lastErr = err
          continue
        }
        if (res.ok) {
          const json = (await res.json()) as { answers?: Record<string, unknown>; usage?: { input_tokens?: number } }
          const answers = Object.fromEntries(Object.entries(json.answers ?? {}).map(([key, a]) => [key, p.answer(a)]))
          return { answers: answers as Record<string, ChoiceAnswer>, inputTokens: json.usage?.input_tokens ?? 0 }
        }
        lastErr = new Error(res.status === 402 ? `${p.name}: payment required (402)` : `${p.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
        // A rejected request does not succeed on retry; only a timeout or rate limit does.
        if (res.status < 500 && res.status !== 408 && res.status !== 429) throw lastErr
      }
      throw lastErr
    },
  }
}

export function jevBackend(opts: JevOptions = {}): Backend {
  const apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set')
  return systemOneBackend({ name: 'TypeSafe', url: opts.baseUrl ?? 'https://api.typesafe.ai', apiKey, model: opts.model ?? 'jev-latest',
    timeoutMs: opts.timeoutMs ?? 90_000, retries: opts.retries ?? 4, criteria: (c) => c, answer: (a) => a })
}

// Laya caps each option at 48 tokens and shares a 192 or 256 token budget across every option,
// so only the `what` text is sent; examples and not_for would push it out of the prompt.
function layaCriteria(criteria: Record<string, Criterion>): Record<string, string> {
  return Object.fromEntries(Object.entries(criteria).map(([key, c]) => [key, c.what]))
}

// Laya's `confidence` is normalised entropy; `answer_confidence` is the calibrated probability of the choice.
function layaAnswer(answer: unknown): unknown {
  if (!answer || typeof answer !== 'object') return answer
  const { choice, probabilities, answer_confidence } = answer as Record<string, unknown>
  return { choice, confidence: answer_confidence, probabilities }
}

/** Requires a running `laya-serve`; the key is only needed when the server sets LAYA_API_KEY. */
export function layaBackend(opts: LayaOptions = {}): Backend {
  const model = opts.model ?? LAYA_MODELS[0]
  if (!LAYA_MODELS.includes(model)) throw new Error(`Unknown Laya checkpoint: use one of ${LAYA_MODELS.join(', ')}`)
  return systemOneBackend({ name: 'Laya', url: opts.baseUrl ?? LAYA_DEFAULT_URL, apiKey: opts.apiKey ?? process.env.LAYA_API_KEY, model,
    timeoutMs: opts.timeoutMs ?? 90_000, retries: opts.retries ?? 4, criteria: layaCriteria, answer: layaAnswer })
}
