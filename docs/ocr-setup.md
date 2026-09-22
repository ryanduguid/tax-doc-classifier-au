# Local OCR setup

## Default runtime

The PDF bridge uses pdf-inspector 1.19.0. Native text needs only that Python package. Offline OCR also requires PDFium, ONNX Runtime and cached PP-OCRv6 Small models, as documented in [pdf-inspector's runtime guide](https://github.com/firecrawl/pdf-inspector/blob/main/docs/ocr-runtime.md).

The tested runtime uses PDFium native-v7988, ONNX Runtime 1.27.0 and model revision oar-ocr-v0.7.0. Its Windows external OCR runtime is documented upstream as preview. The local synthetic integration check passed; that does not establish compatibility across Windows installations.

## Why add full PaddleOCR

The lighter engine read the upright and 3-degree skewed synthetic invoices. A 90-degree sideways image produced 53 characters but no useful category. The full PaddleOCR pipeline detected 270-degree orientation and recovered the invoice text. See [local probe results](../eval/au/ocr-probe.json) and [Paddle probe](../eval/au/paddle-probe.json).

The [PaddleOCR pipeline](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr/_pipelines/ocr.py) supports document orientation and text-line orientation. These capabilities justify a narrow fallback here. PP-StructureV3 table extraction and document unwarping were not added because this pilot only classifies pages.

## Optional Paddle environment

Create an isolated Python environment and install `requirements-paddle.txt`. Tested versions: Python 3.12, PaddleOCR 3.7.0 and PaddlePaddle 3.3.0 on Windows CPU. The setup installed 69 packages, so it remains optional.

The wrapper requires these model directories under the directory passed as `--paddle-models`:

- `PP-LCNet_x1_0_doc_ori`
- `PP-LCNet_x1_0_textline_ori`
- `PP-OCRv6_small_det`
- `PP-OCRv6_small_rec`

Each must contain `inference.json`, `inference.pdiparams` and `inference.yml`. Obtain official models from PaddleOCR using a separate, deliberate setup step. Check their licences and integrity under your deployment process. This repository does not distribute model weights.

`python scripts/probe-paddle.py` is a synthetic research/setup probe that downloads these public models if missing. It operates only on the committed synthetic sideways PDF and is never called by the classifier. Set `PADDLE_PDX_CACHE_HOME` to a dedicated cache first. The models will be stored in its `official_models` directory.

The production wrapper `scripts/extract-paddle.py` passes every model directory explicitly, enables offline environment options, and refuses Python socket connections. It renders only selected failed pages in memory, without saving client images. It is not an operating-system sandbox; deploy under an egress restriction if a network isolation guarantee is required.

## Limits

The comparison used one clean, one lightly skewed and one sideways synthetic invoice. It does not cover handwriting, severe blur, warped photographs, complex tables or all issuer layouts. Low OCR scores trigger review. The fallback has a 120-second process timeout; pages remain flagged if it cannot complete. No hosted fallback is implemented.

The probe's setup time includes model downloads. Inference timings are single local measurements, not comparable service benchmarks or production latency promises.
