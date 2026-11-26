import { execFileSync } from 'node:child_process'
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('loads the manifest beside the downloader in a path with URL characters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eval #'))
  try {
    const script = join(dir, 'download.mts')
    await copyFile(new URL('./download.ts', import.meta.url), script)
    await writeFile(join(dir, 'manifest.json'), '[]')
    execFileSync(process.execPath, ['--experimental-strip-types', script], { timeout: 10_000 })
    expect(await readdir(join(dir, 'corpus', 'blank'))).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
