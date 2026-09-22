"""Offline fallback for selected PDF pages after pdf-inspector fails to read them."""
import contextlib
import json
import os
from pathlib import Path
import socket
import sys


def extract(path, pages, model_root):
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["MODELSCOPE_OFFLINE"] = "1"
    os.environ["OMP_NUM_THREADS"] = "1"

    def no_network(*args, **kwargs):
        raise RuntimeError("Network access is disabled during OCR")

    # Paddle's model loading uses Python networking. Local paths are mandatory too.
    socket.create_connection = no_network
    socket.socket.connect = no_network
    socket.socket.connect_ex = no_network
    models = {"doc_orientation_classify": "PP-LCNet_x1_0_doc_ori",
              "textline_orientation": "PP-LCNet_x1_0_textline_ori",
              "text_detection": "PP-OCRv6_small_det",
              "text_recognition": "PP-OCRv6_small_rec"}
    options = {}
    for key, name in models.items():
        directory = Path(model_root) / name
        for required in ("inference.json", "inference.pdiparams", "inference.yml"):
            if not (directory / required).is_file():
                raise ValueError("Required offline model file is missing")
        options[key + "_model_name"] = name
        options[key + "_model_dir"] = str(directory.resolve())
    import numpy as np
    import pypdfium2 as pdfium
    from paddleocr import PaddleOCR

    pipeline = PaddleOCR(**options, use_doc_orientation_classify=True, use_doc_unwarping=False,
                         use_textline_orientation=True, device="cpu", enable_mkldnn=False)
    output = []
    with pdfium.PdfDocument(path) as doc:
        for number in pages:
            if number < 1 or number > len(doc):
                raise ValueError("Invalid page number")
            page = doc[number - 1]
            bitmap = page.render(scale=2)
            # Paddle accepts a BGR image array; no temporary client image is written.
            rgb = np.asarray(bitmap.to_pil().convert("RGB"))
            results = list(pipeline.predict(rgb[:, :, ::-1].copy()))
            bitmap.close()
            page.close()
            if len(results) != 1:
                raise ValueError("Unexpected OCR result count")
            data = results[0].json["res"]
            scores = data["rec_scores"]
            text = "\n".join(data["rec_texts"])
            warnings = [] if text.strip() and scores and min(scores) >= 0.8 else ["paddle_ocr_requires_review"]
            output.append({"page": number, "text": text, "extraction": "ocr", "warnings": warnings,
                           "ocrEngine": "paddleocr-3.7.0-pp-ocrv6-small"})
    return output


if __name__ == "__main__":
    try:
        # Libraries may write setup messages to stdout. Keep the JSON channel clean.
        with contextlib.redirect_stdout(sys.stderr):
            result = extract(sys.argv[1], [int(p) for p in sys.argv[2].split(",")], sys.argv[3])
        print(json.dumps(result, ensure_ascii=True))
    except Exception:
        print("Offline PaddleOCR failed. Check installed packages and local model files.", file=sys.stderr)
        sys.exit(1)
