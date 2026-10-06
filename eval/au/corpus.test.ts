import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { FILES, loadCorpus } from './corpus.js'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

it('loads the original corpus with every current regression case', async () => {
  const { datasets } = await loadCorpus()
  expect(datasets.development).toHaveLength(15)
  expect(datasets['held-out']).toHaveLength(42)
  expect(datasets.regression.length).toBeGreaterThanOrEqual(35)
  expect(datasets.hardening.length).toBeGreaterThanOrEqual(23)
})

it.each(['development', 'held-out'])('rejects relabelled %s fixtures even when counts stay equal', async name => {
  const directory = await mkdtemp(join(tmpdir(), 'au-corpus-'))
  temporary.push(directory)
  await Promise.all(FILES.map(file => copyFile(new URL(`./${file}.json`, import.meta.url), join(directory, `${file}.json`))))
  const path = join(directory, `${name}.json`)
  const rows = JSON.parse(await readFile(path, 'utf8'))
  rows[0].label = rows[0].label === 'unknown' ? 'tax-invoice' : 'unknown'
  await writeFile(path, JSON.stringify(rows, null, 2) + '\n')
  await expect(loadCorpus(pathToFileURL(directory + sep))).rejects.toThrow(`Original ${name} corpus changed`)
})
