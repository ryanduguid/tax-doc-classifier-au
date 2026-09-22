import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { readAuPages, classifyAuRules } from '../src/au/index.js'

const results = []
for (const file of ['scan.pdf', 'scan-skewed.pdf', 'scan-sideways.pdf']) {
  const start = performance.now()
  const pages = await readAuPages(fileURLToPath(new URL(`../eval/au/pdf/${file}`, import.meta.url)),
    { python: process.argv[2] ?? 'python', ocr: true })
  results.push({ file, elapsedMs: Math.round(performance.now() - start),
    pages: pages.map(p => ({ page: p.page, extraction: p.extraction, textCharacters: p.text.length,
      documentType: classifyAuRules(p).documentType, warnings: p.warnings ?? [] })) })
}
await writeFile(new URL('../eval/au/ocr-probe.json', import.meta.url), JSON.stringify({
  engine: 'pdf-inspector 1.19.0 / PP-OCRv6 Small / ONNX Runtime 1.27.0',
  platform: process.platform, syntheticOnly: true, headToHeadPaddleBenchmark: false, results,
}, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
