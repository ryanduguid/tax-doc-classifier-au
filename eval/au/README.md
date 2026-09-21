# Synthetic Australian corpus

All text in these fixtures was fabricated for this pilot. No client documents, actual identifiers or issuer templates are included. Development and held-out cases were written before the Australian classifier and committed separately. Each layout has a distinct group; split by source/layout when adding real evaluation data.

The held-out set uses independently worded examples, but the same author designed both sets and the classifier. This is a development holdout, not an independent blind benchmark. It tests vocabulary, ambiguity, instructions, unrelated pages, sparse text and extraction failure. It does not establish accuracy on real issuers, bad scans or tax years.

The fixture labels name document types only. They do not establish deductibility, authenticity, completeness, tax readiness or entitlement. Instructions about a document are labelled unknown. Mixed tax invoice/receipt evidence is ambiguous. Missing extraction is unreadable, never blank.

Do not tune rules against held-out failures and continue calling the same set unseen. Record failures, keep this version immutable, and use a new evaluation set after tuning. PDF smoke fixtures are separate synthetic integration checks, not added to accuracy counts.
