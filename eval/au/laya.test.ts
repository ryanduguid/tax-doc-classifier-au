import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

const { ask } = vi.hoisted(() => ({ ask: vi.fn(async () => { throw new Error('evaluation test model unavailable') }) }))
vi.mock('../../src/au/index.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/au/index.js')>(),
  layaBackend: () => ({ ask }),
}))

it('writes a separate evaluation without replacing previous evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tax-doc-laya-evaluation-'))
  const output = join(directory, 'comparison.json')
  const retained = new URL('./laya-results.json', import.meta.url)
  const before = await readFile(retained)
  const argv = process.argv
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ device: 'test', loaded: [] }))))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  process.argv = [argv[0], 'eval/au/laya.ts', '--output', output]
  try {
    vi.resetModules()
    await import('./laya.js')
    const report = JSON.parse(await readFile(output, 'utf8'))
    expect(report.schema).toBe('au-laya-evaluation-2')
    expect(report.calls).toBeGreaterThan(0)
    expect(report.results['held-out'].modelOnly.failed.length).toBeGreaterThan(0)
    expect(await readFile(retained)).toEqual(before)
    await writeFile(output, 'previous evidence')
    vi.mocked(fetch).mockClear()
    ask.mockClear()
    vi.resetModules()
    await expect(import('./laya.js')).rejects.toThrow(/EEXIST|exist/i)
    expect(fetch).not.toHaveBeenCalled()
    expect(ask).not.toHaveBeenCalled()
    expect(await readFile(output, 'utf8')).toBe('previous evidence')

    for (const gate of ['0', '-1', '1.01', 'NaN', 'Infinity', '']) {
      process.argv = [argv[0], 'eval/au/laya.ts', `--gate=${gate}`]
      vi.resetModules()
      await expect(import('./laya.js')).rejects.toThrow(/gate/)
      expect(fetch).not.toHaveBeenCalled()
      expect(ask).not.toHaveBeenCalled()
    }
    for (const path of ['', join(directory, 'missing', 'report.json'), directory]) {
      process.argv = [argv[0], 'eval/au/laya.ts', '--output', path]
      vi.resetModules()
      await expect(import('./laya.js')).rejects.toThrow(/output|ENOENT/)
      expect(fetch).not.toHaveBeenCalled()
      expect(ask).not.toHaveBeenCalled()
    }

    const raced = join(directory, 'raced.json')
    process.argv = [argv[0], 'eval/au/laya.ts', '--output', raced]
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }))
    vi.resetModules()
    await expect(import('./laya.js')).rejects.toThrow(/No Laya server/)
    expect(ask).not.toHaveBeenCalled()
    await expect(readFile(raced)).rejects.toThrow(/ENOENT/)

    for (const body of ['null', '[]']) {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(body))
      vi.resetModules()
      await expect(import('./laya.js')).rejects.toThrow(/Invalid Laya health/)
      expect(ask).not.toHaveBeenCalled()
      await expect(readFile(raced)).rejects.toThrow(/ENOENT/)
    }
    vi.mocked(fetch).mockImplementationOnce(async () => {
      await writeFile(raced, 'concurrent evidence')
      return new Response('{}')
    })
    vi.resetModules()
    await expect(import('./laya.js')).rejects.toThrow(/EEXIST/)
    expect(await readFile(raced, 'utf8')).toBe('concurrent evidence')
    expect(await readFile(retained)).toEqual(before)
  } finally {
    process.argv = argv
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await rm(directory, { recursive: true, force: true })
  }
})
