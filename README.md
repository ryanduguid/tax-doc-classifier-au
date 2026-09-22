# Australian tax document classifier

A local pilot for sorting Australian tax and accounting documents into reviewable categories. Forked from [kyotofin/tax-doc-classifier](https://github.com/kyotofin/tax-doc-classifier); modified for Australia on 22 September 2026.

The default CLI runs locally. It does not upload documents, extract financial amounts, calculate tax, move files or approve classifications. Every result has `requiresReview: true`.

## Quick start

Requires Node 22.13+ and pnpm (pinned to 11.19.0).

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm classify:au examples/au-pack.json
pnpm eval:au
```

After building, run `node dist/au/cli.js examples/au-pack.json`. The CLI writes JSON to stdout. Text/Markdown input uses form-feed characters as page separators. JSON input is an ordered page array:

```json
[{"page":1,"text":"Tax invoice\nGST 10\nTotal due 110","extraction":"native"}]
```

Results contain category suggestions, candidate categories, page numbers, text hashes, method and review reasons. Source text and filenames are omitted. Manifests still need appropriate handling.

## Categories and outcomes

The 15 categories cover income statements, PAYG payment summaries, bank statements, loan statements, dividends, managed fund/AMMA statements, share trade confirmations, rental statements, depreciation schedules, BAS, notices of assessment, tax returns, tax invoices, receipts and private health statements.

These labels do not establish tax readiness, authenticity, deductibility or completeness. No amounts, issuer, entity or income year are extracted.

- `unknown`: unlisted document, insufficient evidence or instructions.
- `ambiguous`: conflicting categories.
- `unreadable`: missing text, extraction failure, OCR required or extraction warnings.

Empty text never establishes a blank page. Rule matches have `confidence: null`; they are not calibrated probabilities.

## PDF input and offline OCR

Install the optional Python dependencies in a dedicated environment:

```sh
python -m pip install -r requirements-pdf.txt
pnpm classify:au document.pdf --python /path/to/python
```

Scans require external PDFium/ONNX libraries and cached PP-OCRv6 models. Follow [pdf-inspector's runtime guide](https://github.com/firecrawl/pdf-inspector/blob/main/docs/ocr-runtime.md), then add `--ocr`:

```sh
pnpm classify:au document.pdf --python /path/to/python --ocr
```

Set `PDFIUM_LIB_PATH`, `ORT_DYLIB_PATH` and `PDF_INSPECTOR_MODEL_CACHE` as needed. Windows accepts the existing environment's full Python executable path. The bridge always uses `offline=True`: missing models cause an error rather than downloads or uploads.

The limits are 50 MiB per input, 500 PDF pages, 200,000 extracted characters per page and 120 seconds per PDF extraction. File size and page count are checked before text extraction or OCR. Before OCR, every relevant page must fit within 20 million rendered pixels and 10,000 pixels on either side. Oversized pages are refused rather than silently downscaled. The default bridge uses 150 dpi; Paddle uses scale 2.

pdf-inspector handles classification and extraction. Its API does not expose page dimensions, so pypdfium2 5.13.0 supplies the geometry preflight only. Install the updated requirements even if you already have an older PDF environment. These checks bound the requested OCR images; they are not an operating-system memory sandbox.

### Optional PaddleOCR fallback

The full PaddleOCR pipeline recovered a sideways synthetic scan that the lighter OCR could not classify. It is therefore available as an optional fallback. It runs only for pages marked as needing OCR or for OCR pages returning unknown/unreadable. Native pages and successful OCR pages keep the first result.

Install `requirements-paddle.txt` in a separate Python environment. Pre-download the 4 official models listed in [OCR setup](docs/ocr-setup.md). During document processing the wrapper requires local model paths and blocks Python network connections.

```sh
pnpm classify:au document.pdf --python /path/to/pdf-inspector/python --ocr --paddle-python /path/to/paddle/python --paddle-models /path/to/official_models
```

The manifest records the OCR engine. A missing model or failed fallback remains a review outcome. This is evidence of improvement on one synthetic rotation case, not a general accuracy comparison.

Paddle retains a confidence score for each extracted line. Lines below 0.8 cannot supply classification evidence. A weak footer therefore need not suppress a suggestion supported by other lines. The warning remains, all suggestions require review, and partially trusted OCR text is never sent to the optional model. Other extraction warnings still block classification.

For batches, the library's `retryAuDocumentsWithPaddle([{ file, pages }, ...], { python, models })` reuses one loaded Paddle instance. Supply pages already extracted with pdf-inspector. Results are page arrays in input-document order; native pages bypass fallback and a failed document does not discard successful neighbours. Limits: 50 documents, 500 selected pages and 120 seconds for the whole batch. A process timeout flags all selected pages. The CLI still accepts one file at a time.

## Library

The package root and `/au` expose the Australian API:

```ts
import { classifyAuRules } from 'tax-doc-classifier-au'
const result = classifyAuRules({
  page: 1, text: 'Tax invoice\nGST 10\nTotal due 110', extraction: 'native',
})
// documentType: 'tax-invoice'; confidence: null; requiresReview: true
```

Optional `classifyAuPage(page, options)` reuses the upstream `Backend` interface. A supplied backend is called only with `allowModelProcessing: true`, which authorises sending complete page text to that backend. It is not a redaction or compliance control. The CLI exposes local rules only.

Set `modelPolicy: 'uncertain'` to call the backend only for unknown or ambiguous readable pages. Resolved rule suggestions then make zero calls and still require review. The default `modelPolicy: 'compare'` preserves full model comparison for evaluation. Authorisation is required whenever text will be sent; unreadable pages and OCR warnings bypass the model in either mode.

Model results need valid labels and a complete, consistent probability distribution. Unknown predictions remain unknown, low-confidence predictions abstain, and conflicting evidence is ambiguous. Provider errors become sanitised review reasons. All model suggestions still require review. The default 0.95 gate is experimental; Australian calibration has not been measured.

The default Jev adapter sends text to TypeSafe's hosted API. No live model evaluation was run. Authorise any external processing and review data handling separately.

The original US API remains at `tax-doc-classifier-au/us`, with upstream behaviour and PDF limitations. Do not use it as the Australian API. The original [README](docs/upstream-readme.md) is preserved.

## Evidence

Local rules score 15/15 development cases and 42/42 synthetic holdout cases. A category-name keyword baseline scores 11/15 and 20/42. The same author designed the rules and examples: these are development checks, not evidence of field accuracy.

A separate 29-case regression set covers address blocks, payment instructions, late mixed headings and unreliable OCR lines. All 29 pass. Evaluation fails on any incorrect prediction, missing category in the original datasets or reduction below their minimum case counts. Updating the saved results does not bypass these gates. New cases are development regressions, not an independent holdout.

A further 20 hardening cases cover document requests, unpaid receipts, headings without supporting evidence and ordered tax labels. All 20 pass. Headings cannot supply their own supporting evidence; receipt matching distinguishes paid from unpaid. Invoice and BAS label checks scan tokens once, avoiding repeated rescanning on long incomplete input.

Every suggestion needs review. Automated coverage is zero; time saved is unmeasured. See [results](eval/au/results.json), [corpus provenance](eval/au/README.md), [evaluation](docs/evaluation.md) and the [repository comparison](docs/repository-comparison.md).

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm eval:au
python scripts/test_pdf_bridges.py
python scripts/test_pdf_native.py
pnpm test:pdf /path/to/python-with-pdf-inspector
```

The full PDF check requires the offline runtime and exercises native pages, image-only refusal, OCR, empty pages and the built CLI. CI runs TypeScript, unit tests, dependency-free Python bridge tests, builds and text evaluation on Windows and Linux. A separate CI job installs requirements-pdf.txt and checks real native PDFs, early limits and sanitised subprocess failures. Full OCR with cached models remains a separate local integration check.

To test the optional fallback as well, append the Paddle Python executable and model directory to `pnpm test:pdf`.

The synthetic PDF fixtures can be regenerated with `python scripts/make-au-pdf-fixtures.py` after installing `requirements-fixtures.txt`. Their simple layouts test integration, not production accuracy.

## Licence

Apache-2.0. Preserve upstream notices when redistributing. Australian taxonomy and fixtures are original synthetic material; see [DATA-LICENSE.md](DATA-LICENSE.md). Optional engines and models retain their own licences. The package is private to prevent accidental npm publication.
