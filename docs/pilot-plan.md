# Australian pilot

Scope agreed on 22 September 2026: fork the classifier, compare alternative repositories, implement Australian document categories, and evaluate a local pilot. Use public or synthetic data. No client uploads or paid inference runs.

## Acceptance checks

- Compare the original project with Paperless-ngx, Paperless-AI, Docling, Unstructured and pdf-inspector using primary sources. Record the choice and reuse decisions.
- Provide 15 Australian categories with distinct unknown, ambiguous and unreadable outcomes. Keep classification separate from tax advice and amount extraction.
- Run a local CLI on text, JSON page packs and PDFs. Preserve page order and extraction provenance. Do not rename or move inputs.
- Support optional offline OCR through pdf-inspector. OCR warnings must remain review outcomes; empty text must never imply blank.
- Keep all pilot suggestions subject to review. Retain the existing backend interface for separately authorised model evaluation; reject malformed responses and preserve unknown predictions.
- Commit independently written development and held-out synthetic cases before tuning rules. Report per-category accuracy, unknown handling, review rate and automated coverage. Synthetic results do not establish field accuracy.
- Run the existing test, typecheck and build commands, plus the Australian evaluation and native/scanned PDF integration checks. Inspect package contents.
- Publish the authorised fork with the comparison, usage instructions, data provenance and measured limitations. Preserve upstream licence notices.

## Boundaries

No document grouping, lodgement, tax calculations, UI, vector database or document archive in this pilot. Each page remains separately reviewable. The shared Xero fixture README was checked; its exports are spreadsheets, so they are not represented as a PDF benchmark here.
