import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { classifyAuRules, validatePage, type AuPage } from './classify.js'

const run = promisify(execFile)
export type ReadOptions = { python?: string; ocr?: boolean }

export async function retryAuPagesWithPaddle(file: string, pages: AuPage[], opts: { python: string; models: string }): Promise<AuPage[]> {
  return (await retryAuDocumentsWithPaddle([{ file, pages }], opts))[0]
}

/** Reuse one local model instance for a bounded batch; preserve document and page order. */
export async function retryAuDocumentsWithPaddle(documents: { file: string; pages: AuPage[] }[], opts: { python: string; models: string }): Promise<AuPage[][]> {
  if (!Array.isArray(documents) || !documents.length || documents.length > 50) throw new Error('Supply between 1 and 50 documents.')
  const jobs = documents.map(({ file, pages }, index) => {
    validatePages(pages)
    if (extname(file).toLowerCase() !== '.pdf') throw new Error('Paddle fallback accepts PDF input only.')
    return { index, file: resolve(file), pages: pages.filter(p => ['needs_ocr', 'failed'].includes(p.extraction) ||
      (p.extraction === 'ocr' && ['unknown', 'unreadable'].includes(classifyAuRules(p).documentType))).map(p => p.page) }
  }).filter(job => job.pages.length)
  if (jobs.reduce((n, j) => n + j.pages.length, 0) > 500) throw new Error('Retry at most 500 pages per batch.')
  const output = documents.map(d => d.pages)
  if (!jobs.length) return output
  const script = fileURLToPath(new URL('../../scripts/extract-paddle.py', import.meta.url))
  const failed = (index: number, numbers: number[]) => {
    output[index] = documents[index].pages.map(p => numbers.includes(p.page)
      ? { ...p, warnings: [...(p.warnings ?? []), 'paddle_fallback_failed'] } : p)
  }
  try {
    const pending = run(opts.python, ['-X', 'utf8', script, '--batch', resolve(opts.models)],
      { timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
    // execFile reports process errors through pending; a closed stdin must not escape as an unhandled event.
    pending.child.stdin?.on('error', () => {})
    pending.child.stdin?.end(JSON.stringify(jobs.map(({ file, pages }) => ({ file, pages }))))
    const { stdout } = await pending
    const response: unknown = JSON.parse(stdout)
    if (!Array.isArray(response) || response.length !== jobs.length) throw new Error('Document mismatch')
    jobs.forEach((job, i) => {
      try {
        const recovered = validatePages(response[i])
        if (recovered.length !== job.pages.length || recovered.some((p, k) => p.page !== job.pages[k])) throw new Error('Page mismatch')
        const byPage = new Map(recovered.map(p => [p.page, p]))
        output[job.index] = documents[job.index].pages.map(p => byPage.get(p.page) ?? p)
      } catch { failed(job.index, job.pages) }
    })
  } catch {
    jobs.forEach(job => failed(job.index, job.pages))
  }
  return output
}

export function validatePages(input: unknown): AuPage[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 500) throw new Error('Supply between 1 and 500 pages.')
  let previous = 0
  for (const page of input) {
    validatePage(page)
    if (page.page <= previous) throw new Error('Page numbers must be unique and increasing.')
    previous = page.page
  }
  return input
}

export async function readAuPages(path: string, opts: ReadOptions = {}): Promise<AuPage[]> {
  const file = resolve(path)
  if ((await stat(file)).size > 50 * 1024 * 1024) throw new Error('Input exceeds the 50 MiB pilot limit.')
  const extension = extname(file).toLowerCase()
  if (extension === '.pdf') {
    const script = fileURLToPath(new URL('../../scripts/extract-au.py', import.meta.url))
    try {
      const { stdout } = await run(opts.python ?? 'python', ['-X', 'utf8', script, file, ...(opts.ocr ? ['--ocr'] : [])],
        { timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
      return validatePages(JSON.parse(stdout))
    } catch {
      throw new Error('Local PDF extraction failed. Check Python, pdf-inspector and the offline OCR runtime; no upload was attempted.')
    }
  }
  if (!['.txt', '.md', '.json'].includes(extension)) throw new Error('Supported inputs: PDF, text, Markdown and JSON page arrays.')
  const text = await readFile(file, 'utf8')
  if (extension === '.json') return validatePages(JSON.parse(text.replace(/^\uFEFF/, '')))
  return validatePages(text.split('\f').map((text, i) => ({ page: i + 1, text, extraction: 'native' })))
}
