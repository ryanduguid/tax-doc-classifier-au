"""Local pdf-inspector bridge. Never downloads models or sends documents online."""
import json
import sys


def extract(path, ocr):
    import pdf_inspector

    if ocr:
        result = pdf_inspector.process_pdf_with_ocr(path, offline=True)
        return [{"page": p.page_number, "text": p.markdown,
                 "extraction": "needs_ocr" if p.provenance.hosted_recommended else
                 ("native" if p.provenance.source == "native" else "ocr"),
                 "warnings": list(p.provenance.warnings),
                 **({"ocrEngine": "pdf-inspector-pp-ocrv6-small"} if p.provenance.source != "native" else {})} for p in result.pages]
    result = pdf_inspector.extract_pages_markdown(path)
    return [{"page": p.page + 1, "text": p.markdown,
             "extraction": "needs_ocr" if p.needs_ocr else "native",
             "warnings": [p.ocr_reason] if p.ocr_reason else []} for p in result.pages]


if __name__ == "__main__":
    try:
        print(json.dumps(extract(sys.argv[1], "--ocr" in sys.argv[2:]), ensure_ascii=True))
    except Exception:
        # Parser exceptions may contain document text or local paths.
        print("Local PDF extraction failed. Check the file and pdf-inspector runtime.", file=sys.stderr)
        sys.exit(1)
