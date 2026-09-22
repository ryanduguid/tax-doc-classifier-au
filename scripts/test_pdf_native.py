"""Real parser and subprocess checks without OCR models or external runtime."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("native_bridge", ROOT / "scripts/extract-au.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def blank_pdf(path, count=1, width=595, height=842):
    # Synthetic vector-only PDF. Even oversized geometry allocates no raster image.
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>"]
    kids = " ".join(f"{n + 3} 0 R" for n in range(count))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {count} >>".encode())
    objects.extend(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] >>".encode() for _ in range(count))
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(data)
    data.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode())
    path.write_bytes(data)


class NativeIntegration(unittest.TestCase):
    def test_real_native_pages_and_json_channel(self):
        result = subprocess.run([sys.executable, str(ROOT / "scripts/extract-au.py"),
            str(ROOT / "eval/au/pdf/native-pack.pdf")], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = json.loads(result.stdout)
        self.assertEqual([r["page"] for r in rows], [1, 2, 3])
        self.assertTrue(all(r["extraction"] == "native" for r in rows))
        self.assertIn("Tax invoice", rows[0]["text"])

    def test_501_pages_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "too-many.pdf"
            blank_pdf(file, count=501)
            with self.assertRaisesRegex(ValueError, "500 pages"):
                bridge.extract(str(file), False)

    def test_large_geometry_rejected_without_ocr_runtime(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "wide.pdf"
            blank_pdf(file, width=20000)
            with self.assertRaisesRegex(ValueError, "image budget"):
                bridge.extract(str(file), True)

    def test_corrupt_input_returns_sanitised_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "PRIVATE_MARKER.pdf"
            file.write_bytes(b"not a PDF")
            result = subprocess.run([sys.executable, str(ROOT / "scripts/extract-au.py"), str(file)],
                capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, "")
            self.assertNotIn("PRIVATE_MARKER", result.stderr)
            self.assertIn("Local PDF extraction failed", result.stderr)

    def test_paddle_subprocess_rejects_missing_models_without_dependencies(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run([sys.executable, str(ROOT / "scripts/extract-paddle.py"),
                "--batch", folder], input=json.dumps([{"file": "PRIVATE_MARKER.pdf", "pages": [1]}]),
                capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, "")
            self.assertNotIn("PRIVATE_MARKER", result.stderr)
            self.assertIn("Offline PaddleOCR failed", result.stderr)


if __name__ == "__main__":
    unittest.main()
