"""Resource limits checked before text extraction or OCR image allocation."""
import math
from pathlib import Path

MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_PAGES = 500
MAX_RENDER_PIXELS = 20_000_000
MAX_RENDER_SIDE = 10_000


def check_file(path):
    file = Path(path)
    if not file.is_file() or file.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("PDF input must be a file of at most 50 MiB")


def check_page_count(count):
    if type(count) is not int or not 1 <= count <= MAX_PAGES:
        raise ValueError("PDF input must contain between 1 and 500 pages")


def check_render_size(width, height, scale):
    if any(not math.isfinite(n) or n <= 0 for n in (width, height, scale)):
        raise ValueError("Invalid PDF page dimensions")
    pixels = (math.ceil(width * scale), math.ceil(height * scale))
    if max(pixels) > MAX_RENDER_SIDE or pixels[0] * pixels[1] > MAX_RENDER_PIXELS:
        raise ValueError("PDF page exceeds the OCR image budget")


def check_geometry(doc, pages, scale):
    check_page_count(len(doc))
    if not pages or len(pages) > MAX_PAGES or any(type(n) is not int or not 1 <= n <= len(doc) for n in pages):
        raise ValueError("Invalid selected PDF pages")
    if pages != sorted(set(pages)):
        raise ValueError("Selected PDF pages must be unique and increasing")
    # Validate every selected page before rendering any of them.
    for number in pages:
        page = doc[number - 1]
        try:
            check_render_size(*page.get_size(), scale)
        finally:
            page.close()
