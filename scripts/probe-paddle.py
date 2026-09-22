"""Compare full PaddleOCR on the synthetic sideways scan that defeated pdf-inspector.

This research probe may download public models. It is never called by the classifier.
"""
import json
import time
from pathlib import Path
import pypdfium2 as pdfium
from paddleocr import PaddleOCR

root = Path(__file__).resolve().parent.parent
image = root / "eval/au/pdf/scan-sideways.pdf.png"
doc = pdfium.PdfDocument(root / "eval/au/pdf/scan-sideways.pdf")
doc[0].render(scale=2).to_pil().save(image)
start = time.perf_counter()
ocr = PaddleOCR(use_doc_orientation_classify=True, use_doc_unwarping=False,
                use_textline_orientation=True, text_detection_model_name="PP-OCRv6_small_det",
                text_recognition_model_name="PP-OCRv6_small_rec", device="cpu", enable_mkldnn=False)
setup_ms = round((time.perf_counter() - start) * 1000)
start = time.perf_counter()
predictions = list(ocr.predict(str(image)))
rows = []
for result in predictions:
    data = result.json["res"]
    rows.append({"page": 1, "text": "\n".join(data["rec_texts"]), "extraction": "ocr",
                 "warnings": [], "angle": data.get("doc_preprocessor_res", {}).get("angle"),
                 "scores": data["rec_scores"]})
report = {"engine": "PaddleOCR 3.7.0 / PaddlePaddle 3.3.0 / PP-OCRv6 Small",
          "syntheticOnly": True, "setupMs": setup_ms, "inferenceMs": round((time.perf_counter() - start) * 1000),
          "pages": rows}
(root / "eval/au/paddle-probe.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
