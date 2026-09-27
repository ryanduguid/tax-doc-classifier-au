# Pilot evaluation

Measured locally on Windows on 22 September 2026. These are synthetic development and integration results. No client documents or paid classification API calls were used.

## Classification

| Dataset | Cases | Rules correct | Keyword baseline correct |
|---|---:|---:|---:|
| Development | 15 | 15 | 11 |
| Held-out synthetic layouts and edge cases | 42 | 42 | 20 |
| Optimisation regression cases | 35 | 35 | 16 |
| False-positive and ordering hardening | 20 | 20 | 10 |

The corpus was committed at `6e57d85` before the Australian classifier. The held-out set has 2 examples for each of 15 categories, plus 12 edge cases covering unknown content, ambiguous documents, unreadable input, instructions and foreign forms. The [results file](../eval/au/results.json) records corpus hashes, per-category precision/recall and errors. No held-out case was changed after the first evaluation.

The same author wrote the cases and the implementation. This is a development holdout, not a blind external benchmark. It deliberately uses compact text examples. Do not use these scores to claim real-world accuracy or transfer the original project's US results to Australia.

The separate optimisation set was added after reproducing layout failures. Its 35 cases test payment instructions, longer address blocks, misleading requests, late conflicting headings and line-level OCR quality. PR review added positive controls for remittance, payment details and enquiry contact notes and statement request fees, plus requests and instructions beyond line 32. Context checks reuse the supported document names, including noun-first requests, copy requests and reply/forward subject prefixes. It was used during implementation and is not held out. The original 57 fixtures remain unchanged. Evaluation now fails if any case is incorrect, an original dataset loses a category, or a dataset drops below its minimum size. Tests verify that a lower score fails independently of the saved report.

The keyword baseline chooses the first category whose name appears anywhere in the text. The rules require a heading and supporting evidence, detect conflicting categories, and abstain on recognised instructional content. Neither method performs financial extraction.

Every result requires review. Review rate: 100%. Automated coverage: 0%. Automatic error rate: not measurable because nothing is automatically accepted. Review time saved: not measured. Live TypeSafe performance: not measured. A local Laya model was measured on 27 September 2026; see below.

## Local model: Laya

Measured on 27 September 2026 with laya 0.3.20 served by `laya-serve` on this Windows machine, CPU only with 12 threads, through `pnpm eval:au:laya`. The default gate of 0.95 applied. Each readable page was sent once per checkpoint; unreadable pages and pages with OCR warnings never reach a model. The tables below are the CPU runs of all three checkpoints through `--model`. The [results file](../eval/au/laya-results.json) records a later run of the default `typed-decisions` checkpoint on the GPU with the same figures.

Raw model choice against the truth label, before any rule or gate:

| Dataset | Pages sent | `multilingual` | `english` | `typed-decisions` | Wrong at or above 0.95, `multilingual` / `typed-decisions` |
|---|---:|---:|---:|---:|---:|
| Development | 15 | 15 | 15 | 15 | 0 / 0 |
| Held-out | 40 | 29 | 28 | 31 | 7 / 3 |
| Regression | 31 | 13 | 13 | 13 | 17 / 5 |
| Hardening | 20 | 8 | 7 | 7 | 10 / 8 |

The model identifies most synthetic pages that contain a whole document. Its errors are concentrated on pages whose truth is unknown or ambiguous: requests for a document, instructions, templates, headings without supporting evidence and sparse text. It labels these with the document type they mention, usually at confidence 1.0 on `multilingual`, so the gate does not catch them. Mean confidence on the held-out set was 0.98 when right and 0.87 when wrong. The `typed-decisions` checkpoint, which its authors fine-tuned on invoice processing and three other workflows, is less sure of itself: mean confidence 0.84 when right on the held-out set, and 16 confident errors across the four sets against 34 for `multilingual`. No page reached any checkpoint's context limit, so truncation of long pages remains unmeasured.

Pipeline outcomes with `classifyAuPage`, all cases including unreadable ones:

| Dataset | Rules only | Uncertain, `multilingual` | Uncertain, `typed-decisions` | Compare, `multilingual` |
|---|---:|---:|---:|---:|
| Development | 15/15 | 15/15 | 15/15 | 14/15 |
| Held-out | 42/42 | 40/42 | 41/42 | 33/42 |
| Regression | 35/35 | 34/35 | 35/35 | 19/35 |
| Hardening | 20/20 | 14/20 | 16/20 | 9/20 |

Compare mode sends every readable page and replaces the rule outcome with the model's, so below-gate agreement becomes unknown and disagreement becomes ambiguous; it exists for evaluation. It punishes the lower confidence of `typed-decisions` with the 0.95 gate: 8/15, 17/42, 20/35 and 8/20. Uncertain mode keeps every rule outcome and asks the model only about pages the rules cannot resolve. Its first run with `multilingual` scored 15/15, 36/42, 19/35 and 10/20, because recognised requests and instructions were still sent to the model. Uncertain mode now keeps the rule outcome for pages with the reason `context_only_or_instructions`, which gave the figures in the table; the same change applies to any backend. The remaining uncertain-mode errors are title-only and sparse pages, where the rules abstain for lack of supporting evidence and the model asserts the titled type. The `english` checkpoint gave the same pipeline figures as `multilingual` in uncertain mode.

The `multilingual` run made 122 calls in 48 seconds, about 0.4 seconds per call on the CPU; `english` took 85 seconds and `typed-decisions` 68 seconds for the same calls. On the same machine's RTX 5080, with torch 2.14.0+cu132 and `LAYA_DEVICE=cuda`, a warm server answered the 106 distinct pages in 2.7 seconds (`multilingual`) and 3.2 seconds (`typed-decisions`), about 25 to 30 milliseconds per call; the first call after start-up adds several seconds of warm-up. The evaluation script now asks the server once per page and replays the answer for its second policy pass. GPU arithmetic moved one `multilingual` held-out answer and one `typed-decisions` regression answer across the 0.95 gate; every pipeline figure in uncertain mode was unchanged. These are single runs on one machine, not a throughput benchmark. Laya adds no accuracy on this corpus, where the rules already score 100%. Its value, if any, lies on real pages the rules cannot resolve, which this synthetic corpus does not contain. For English documents in uncertain mode, `typed-decisions` made the fewest confident errors on such pages, so it is the default checkpoint; `multilingual` covers other languages at the same context length. Laya's own documentation reports that fine-tuning on labelled decisions is where its accuracy improves; that has not been attempted here.

## PDF and OCR checks

Five fabricated PDFs cover a 3-page native pack, an upright scan, an empty page, a lightly skewed scan and a sideways scan. Native text and all standard OCR use pdf-inspector. The full PaddleOCR fallback was tested after the sideways file demonstrated a limitation.

| Check | Observed result |
|---|---|
| Native mixed pack | Invoice, bank statement and unknown correspondence; page order preserved |
| Image-only page without OCR | Unreadable; never silently labelled blank |
| Upright scan with offline OCR | Invoice suggestion, still subject to review |
| Empty page | Unreadable, no assertion of blankness |
| 3-degree skew and light blur | Invoice suggestion with pdf-inspector OCR |
| 90-degree sideways scan | pdf-inspector produced text but no category; full PaddleOCR recovered the invoice |
| Missing Paddle model directory | Review failure, no download |
| Native page with Paddle configured | Fallback bypassed |
| Built CLI | Valid review JSON; no source text in manifest; input unchanged |

The [OCR probe](../eval/au/ocr-probe.json) records a single local run, approximately 0.6 to 0.7 seconds per synthetic page including the Python process. The [Paddle probe](../eval/au/paddle-probe.json) records about 32 seconds of initial setup including model downloads and 2.7 seconds of inference. These measurements include different overheads and are not a speed benchmark.

No general head-to-head accuracy claim is supported. Handwriting, severe blur, warped photos, real issuer layouts and multi-page document grouping remain untested. The optional fallback uses local models, checks required files, and blocks Python socket connections during document processing. It is not a network sandbox.

## Software verification

- Frozen dependency installation, TypeScript checking and build pass.
- 52 TypeScript tests pass, covering the original US identifier contract, Australian abstention, malformed model responses, explicit model authorisation, both System One adapters, evidence privacy, page validation, quality gates, model routing, OCR confidence validation, batch limits and adversarial rule performance. Type checking also covers the Australian evaluation and integration scripts.
- 17 dependency-free Python tests pass for preflight ordering, file/page/pixel limits, page numbering, offline routing, model refusal, batch failure isolation, malformed OCR output and resource cleanup.
- 5 Python integration tests pass with real native and synthetic boundary PDFs, including a 501-page refusal, oversized geometry refusal before OCR, JSON output and sanitised subprocess failures.
- Native PDF and offline OCR integration checks pass, including the built CLI.
- Optional Paddle recovery, missing-model refusal and native-page bypass checks pass.
- Package contents were inspected: Australian runtime, both Python bridges and licences are included; tests, model weights and local environments are excluded.
- Synthetic PDF previews were visually checked for legible source text before interpreting the OCR results.

The repository has no lint command. CI now includes both fast bridge tests and a separate native PDF job on Windows and Linux. Full OCR remains a separately provisioned local integration check. Local checks do not establish hosted CI status until its run completes.

## Rule matching and processing limits

The hardening set contains 20 new development examples. It tests requests and enquiries, unpaid receipts, sparse or repeated headings, positive controls and token order. All pass. The original development and holdout files remain unchanged.

The previous invoice support regex repeatedly rescanned incomplete input. On a synthetic page containing repeated GST tokens without a total, the second assessment measured 26, 99 and 394 ms at about 20,000, 40,000 and 80,000 characters. The replacement scans tokens once. Seven new samples at each size gave medians of 0.64, 1.111 and 1.777 ms. See the [recorded samples](../eval/au/rule-performance.json). The earlier figures are single samples and the new figures are medians; neither is a production latency promise. A test caps four repeated-token cases near the 200,000-character limit and a whitespace-padding case at a generous one second combined.

File size and PDF page count are checked before extraction. OCR geometry checks reject more than 20 million pixels or 10,000 pixels on either side before image allocation. Tests use small vector-only PDFs with large page counts or dimensions, so rejection does not require allocating oversized images. The limits bound requested render images, not all parser or model memory.

## Batch optimisation measurement

The local batch API reuses one Paddle instance across selected documents. Two paired measurements processed two copies of the same sideways synthetic PDF. Both modes returned invoice suggestions for both documents. Model downloads were excluded; process startup and inference were included. Run order was alternated.

| Order | Separate processes | Shared model batch |
|---|---:|---:|
| Separate first | 9,770 ms | 7,525 ms |
| Batch first | 9,954 ms | 7,538 ms |

See the [machine-readable measurement](../eval/au/paddle-batch-benchmark.json). These two samples show less elapsed time for this repeated fixture on this Windows machine. They do not establish throughput across real issuers or scan quality. The integration check also verifies native-page bypass, line-confidence alignment and failure isolation for a missing document between successful documents.

Optional model routing now supports `modelPolicy: 'uncertain'`. Stub-backend tests confirm zero calls for a resolved invoice, zero calls for a recognised request and one authorised call for an unresolved page. Comparison mode remains the default. No hosted inference or token-cost benchmark was run; the local Laya measurement is above.

## Next evaluation

Collect an independently labelled set with multiple Australian issuers and years, separating issuers/layouts between development and evaluation. Include rare types, missing documents, difficult scans and unrelated pages. Use public or appropriately authorised examples, with source rights recorded.

Measure suggested-category precision, unknown detection, reviewer acceptance and review time against the current manual process. Only consider automatic routing after an acceptable error budget and held-out calibration have been established. Classification must never establish tax treatment or replace review of amounts.
