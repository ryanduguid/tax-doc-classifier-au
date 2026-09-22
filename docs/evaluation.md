# Pilot evaluation

Measured locally on Windows on 22 September 2026. These are synthetic development and integration results. No client documents or paid classification API calls were used.

## Classification

| Dataset | Cases | Rules correct | Keyword baseline correct |
|---|---:|---:|---:|
| Development | 15 | 15 | 11 |
| Held-out synthetic layouts and edge cases | 42 | 42 | 20 |
| Optimisation regression cases | 23 | 23 | 10 |
| False-positive and ordering hardening | 20 | 20 | 10 |

The corpus was committed at `6e57d85` before the Australian classifier. The held-out set has 2 examples for each of 15 categories, plus 12 edge cases covering unknown content, ambiguous documents, unreadable input, instructions and foreign forms. The [results file](../eval/au/results.json) records corpus hashes, per-category precision/recall and errors. No held-out case was changed after the first evaluation.

The same author wrote the cases and the implementation. This is a development holdout, not a blind external benchmark. It deliberately uses compact text examples. Do not use these scores to claim real-world accuracy or transfer the original project's US results to Australia.

The separate optimisation set was added after reproducing layout failures. Its 23 cases test payment instructions, longer address blocks, misleading requests, late conflicting headings and line-level OCR quality. PR review added positive controls for remittance, payment details and enquiry contact notes, plus requests and instructions beyond line 32. It was used during implementation and is not held out. The original 57 fixtures remain unchanged. Evaluation now fails if any case is incorrect, an original dataset loses a category, or a dataset drops below its minimum size. Tests verify that a lower score fails independently of the saved report.

The keyword baseline chooses the first category whose name appears anywhere in the text. The rules require a heading and supporting evidence, detect conflicting categories, and abstain on recognised instructional content. Neither method performs financial extraction.

Every result requires review. Review rate: 100%. Automated coverage: 0%. Automatic error rate: not measurable because nothing is automatically accepted. Review time saved: not measured. Model calibration and live TypeSafe performance: not measured.

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
- 43 TypeScript tests pass, covering the original US identifier contract, Australian abstention, malformed model responses, explicit model authorisation, evidence privacy, page validation, quality gates, model routing, OCR confidence validation, batch limits and adversarial rule performance. Type checking also covers the Australian evaluation and integration scripts.
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

Optional model routing now supports `modelPolicy: 'uncertain'`. Stub-backend tests confirm zero calls for a resolved invoice and one authorised call for an unresolved page. Comparison mode remains the default. No hosted inference or token-cost benchmark was run.

## Next evaluation

Collect an independently labelled set with multiple Australian issuers and years, separating issuers/layouts between development and evaluation. Include rare types, missing documents, difficult scans and unrelated pages. Use public or appropriately authorised examples, with source rights recorded.

Measure suggested-category precision, unknown detection, reviewer acceptance and review time against the current manual process. Only consider automatic routing after an acceptable error budget and held-out calibration have been established. Classification must never establish tax treatment or replace review of amounts.
