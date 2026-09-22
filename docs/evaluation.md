# Pilot evaluation

Measured locally on Windows on 22 September 2026. These are synthetic development and integration results. No client documents or paid classification API calls were used.

## Classification

| Dataset | Cases | Rules correct | Keyword baseline correct |
|---|---:|---:|---:|
| Development | 15 | 15 | 11 |
| Held-out synthetic layouts and edge cases | 42 | 42 | 20 |

The corpus was committed at `6e57d85` before the Australian classifier. The held-out set has 2 examples for each of 15 categories, plus 12 edge cases covering unknown content, ambiguous documents, unreadable input, instructions and foreign forms. The [results file](../eval/au/results.json) records corpus hashes, per-category precision/recall and errors. No held-out case was changed after the first evaluation.

The same author wrote the cases and the implementation. This is a development holdout, not a blind external benchmark. It deliberately uses compact text examples. Do not use these scores to claim real-world accuracy or transfer the original project's US results to Australia.

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
- 33 unit tests pass, covering the original US identifier contract and Australian abstention, malformed model responses, explicit model authorisation, evidence privacy and page validation.
- Native PDF and offline OCR integration checks pass, including the built CLI.
- Optional Paddle recovery, missing-model refusal and native-page bypass checks pass.
- Package contents were inspected: Australian runtime, both Python bridges and licences are included; tests, model weights and local environments are excluded.
- Synthetic PDF previews were visually checked for legible source text before interpreting the OCR results.

The repository has no lint command. CI is configured for Windows and Linux, with OCR remaining a separately provisioned integration check. Local checks do not establish hosted CI status until its run completes.

## Next evaluation

Collect an independently labelled set with multiple Australian issuers and years, separating issuers/layouts between development and evaluation. Include rare types, missing documents, difficult scans and unrelated pages. Use public or appropriately authorised examples, with source rights recorded.

Measure suggested-category precision, unknown detection, reviewer acceptance and review time against the current manual process. Only consider automatic routing after an acceptable error budget and held-out calibration have been established. Classification must never establish tax treatment or replace review of amounts.
