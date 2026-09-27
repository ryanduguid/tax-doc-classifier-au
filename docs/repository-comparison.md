# Repository comparison and reuse decision

Assessed on 22 September 2026. This is a source and documentation comparison, not a runtime benchmark of the competing projects.

## Decision

Keep kyotofin/tax-doc-classifier as the fork base. Its small TypeScript backend contract and evaluation pattern fit a page-classification pilot. Add an Australian entry point and use the existing local pdf-inspector installation for extraction and OCR. Do not import a document-management application into this library.

The upstream baseline is [3e95a77](https://github.com/kyotofin/tax-doc-classifier/tree/3e95a77f763c6becb78472f8b2ce2f54237f9214). Its classifier embeds IRS prompts, rare form families and US identifiers. The Australian module therefore uses its own taxonomy and abstention contract, while reusing the Backend interface and optional Jev adapter. The IRS module remains separately accessible.

## Alternatives

| Repository and reviewed revision | Evidence | Suitability and decision |
|---|---|---|
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx/blob/cb85441c2ff58f2b93caf44e726050b32465b69d/README.md), cb85441 | Full searchable document archive; GPL-3.0. Its [classifier](https://github.com/paperless-ngx/paperless-ngx/blob/cb85441c2ff58f2b93caf44e726050b32465b69d/src/documents/classifier.py#L47) supports a probability threshold; [AI classification](https://github.com/paperless-ngx/paperless-ngx/blob/cb85441c2ff58f2b93caf44e726050b32465b69d/src/paperless_ai/ai_classifier.py#L252) returns structured suggestions. | Stronger starting point if the actual goal is an archive with users, search and document management. Too much operational scope for this library. Adopt the idea of reviewable suggestions and abstention. No code copied. |
| [Paperless-AI](https://github.com/clusterzx/paperless-ai/blob/d2fda6991e5e55d51d6473997176bb8d054f61fd/README.md), d2fda69 | MIT. AI tagging and local/provider backends, but the README explicitly says the repository is not maintained and questions its future alongside native Paperless-ngx AI. | Do not switch to this base. Its maintenance notice matters more than recent repository activity. Retain optional backends without adding its application stack. |
| [Docling](https://github.com/docling-project/docling/blob/b078ea34921eafe181141e6179e87885196497c3/README.md), b078ea3 | MIT code; individual model licences differ. Document conversion, OCR, layout and tables, with format/model extras in [pyproject.toml](https://github.com/docling-project/docling/blob/b078ea34921eafe181141e6179e87885196497c3/pyproject.toml#L49). | Useful extraction alternative if difficult layouts become an observed blocker. It does not provide an Australian tax taxonomy. No additional parser installed: pdf-inspector is the existing preferred asset and passes this pilot's PDF checks. |
| [Unstructured](https://github.com/Unstructured-IO/unstructured/blob/c75483aa3cf583a9e8f7b995eaccff1fa57b403d/README.md), c75483a | Apache-2.0. Broad format ingestion and element partitioning; [partition()](https://github.com/Unstructured-IO/unstructured/blob/c75483aa3cf583a9e8f7b995eaccff1fa57b403d/unstructured/partition/auto.py#L29) dispatches by file type. | Consider for a future requirement to ingest many non-PDF formats. Extra scope and dependencies for this pilot; not a tax-classifier replacement. |
| [pdf-inspector](https://github.com/firecrawl/pdf-inspector/blob/43c3ae9cd828e7df5fad2b2b37244bdd81b0409b/README.md), 43c3ae9 | MIT. Native text extraction, page-level OCR routing and local OCR provenance. | Reuse as an installed dependency through its Python API. Preserve OCR warnings and original page numbers. No fork required. |

Licences describe the inspected repositories, not every transitive dependency, model or future integration. No code from these alternative repositories was copied.

## PaddleOCR follow-up

At the user's request, [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR/tree/dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf) was also evaluated (Apache-2.0). Its full pipeline supports document and text-line orientation. The isolated local test used PaddleOCR 3.7.0, PaddlePaddle 3.3.0 and PP-OCRv6 Small. It recovered a sideways synthetic invoice that pdf-inspector's OCR left unclassified. An optional offline fallback now uses this capability only for failed or unclassified OCR pages. See [OCR setup and limits](ocr-setup.md).

This is an observed improvement on one rotation case. It does not establish that full PaddleOCR is more accurate in general. The lighter engine remains the default; the full Paddle stack stays in a separate environment.

## Existing assets

Graft queried the existing repository workspace before further implementation. It found an established accounting-adapter pattern that separates original evidence from suggested classification and keeps suggestions subject to review. The pilot follows that contract, without copying private source or adding a cross-repository dependency.

No equivalent Australian page classifier or pdf-inspector wrapper was found in the indexed code searched. That is a bounded search result, not proof that no such asset exists anywhere. The existing pdf-inspector 1.19.0 runtime and cached offline OCR models were reused. The shared accounting fixture README was checked; its Xero exports are spreadsheets, not a labelled PDF corpus.

## What the comparison changed

- Local processing is the default. The CLI has no hosted model switch; its optional Laya switch accepts a loopback server only.
- Every result is a suggestion with a page reference, text hash, method and review reason.
- Unknown and ambiguous outcomes survive classification. No forced choice among known forms.
- OCR and classification are separate. Empty extracted text never proves a blank page.
- A model can use the existing Backend interface only with explicit processing authorisation. Laya was the first measured; see [evaluation](evaluation.md).
- A simple keyword baseline is measured alongside the rules. Corpus hashes and errors are recorded.

## Second comparison, 27 September 2026

A follow-up pass over projects that classify financial documents or learn from user decisions. Primary sources were the repositories' READMEs, documentation pages and repository metadata read on 27 September 2026; no alternative was run.

| Repository or service, revision | Evidence | Suitability and decision |
|---|---|---|
| [PaperCortex](https://github.com/renefichtmueller/PaperCortex), 6f2c869, MIT, pushed 24 September 2026 | LLM classification for Paperless-ngx through local Ollama models (qwen2.5 7B to 32B, llama3.1, mistral) with embedding models; document types invoice, receipt, contract, tax document, letter, statement, certificate; `CLASSIFICATION_CONFIDENCE` (default 0.7) gates `apply: true`; DATEV export; no accuracy figures. | The same shape as this pilot's optional model step, with a threshold before applying. Its seven generic types are coarser than the 15 Australian categories, and its 7B to 32B models are far heavier than Laya. Not adopted; the gate idea already exists at 0.95. |
| [Paperless-ngx](https://docs.paperless-ngx.com/advanced_usage/) advanced usage, read 27 September 2026; repository 7b98085, GPL-3.0 | Matching algorithms None, Any, All, Exact, Regular expression, Fuzzy and Auto. Auto trains a neural network on documents already assigned outside the inbox, needs negative examples and retrains periodically. | The heading-plus-support rules correspond to All with ordering constraints. Adopted the first half of the learning loop: recorded reviewer decisions through `tax-doc-au review`. No automatic retraining, because every page still requires review. |
| [Docspell](https://docspell.org/docs/configure/file-processing/) docs, read 27 September 2026; repository cf3174d, AGPL-3.0 | Auto-tagging learns from existing tags on extracted text on a schedule; training defaults to 600 items and 5,000 characters per text and is memory intensive. | Same pattern on a JVM stack under AGPL. Not adopted. Its item and text limits are a precedent for bounding any future training set. |
| [beancount smart_importer](https://github.com/beancount/smart_importer), db71e8c, MIT, pushed 26 July 2026 | scikit-learn SVC trained on the user's ledger predicts postings and payees during import; corrections become training data; applied automatically; beta. | The accounting precedent for learning from corrections. Automatic application does not fit the review contract; recording decisions does. |
| [invoice2data](https://github.com/invoice-x/invoice2data), 9a62ebd, MIT, pushed 26 September 2026 | Issuer templates identified by `keywords` and `exclude_keywords` regex; field extraction; pdfium input by default and several OCR engines. | Extraction rather than classification, and it extracts amounts, which this pilot excludes. Its exclude-keywords idea mirrors the catalogue's `not_for` notes and the request bypass. Not adopted. |
| stipple.sh classifier, commercial service, read 27 September 2026 | Hosted financial document classifier over payslip, tax invoice, bank statement, salary certificate, PAYG summary and receipt; everything else is other; stateless. | Hosted and closed, so out of scope. Its taxonomy names payslips and salary certificates, which this catalogue maps to unknown. |
| [Ar86Bat/Finance-Document-Text-Classification](https://huggingface.co/Ar86Bat/Finance-Document-Text-Classification), MIT, DistilBERT 67M | Classifies finance text topics (for example investment restrictions) on a synthetic multilingual set; 98.65% accuracy on its own split. | Topic classification, not document type. Not adopted. |

### What the second comparison changed

- `tax-doc-au review` records reviewer decisions against a manifest and reports acceptance by method and category, rejected named suggestions and pages the pipeline missed, keyed by text hash and without text. This is the labelled set the evaluation needs, gathered as a by-product of review.
- Not adopted: automatic retraining on decisions (every page still requires review), Ollama LLM classification (heavier than Laya, no accuracy figures), and a payslip or salary-certificate category, which would need a new taxonomy version and new fixtures because the held-out set is immutable.

## What would change the decision

A requirement for multi-user storage and search would favour adopting Paperless-ngx and integrating the classifier through an API. Complex layout failures could justify comparing Docling on the same approved corpus. Neither need has been established in this pilot. Reviewed decisions that repeatedly name payslips, superannuation statements or other documents outside the 15 categories would justify a new taxonomy version with its own fixtures.

Do not treat the synthetic score as a product case. Before expanding, measure reviewed classification accuracy, acceptance rate and handling time on an independently labelled, authorised set of Australian issuer layouts. Any hosted evaluation needs a separate data-handling decision and explicit approval.
