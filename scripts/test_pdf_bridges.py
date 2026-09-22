"""Fast bridge contracts using library doubles; no models or PDF dependencies needed."""
import importlib.util
import math
from pathlib import Path
import socket
import sys
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import MagicMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pdf_limits import check_file, check_page_count, check_render_size, check_geometry


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


native = load("extract-au")
paddle = load("extract-paddle")


def document(width=595, height=842, count=1):
    page = MagicMock()
    page.get_size.return_value = (width, height)
    doc = MagicMock()
    doc.__len__.return_value = count
    doc.__getitem__.return_value = page
    doc.__enter__.return_value = doc
    return doc, page


class Limits(unittest.TestCase):
    def test_page_count_bounds(self):
        for n in (0, -1, 501, True, 1.5):
            with self.subTest(n=n), self.assertRaises(ValueError):
                check_page_count(n)
        check_page_count(500)

    def test_pixel_bounds_and_non_finite_dimensions(self):
        check_render_size(2500, 2000, 2)
        for size in ((2501, 2000, 2), (5001, 1, 2), (0, 100, 2), (math.nan, 1, 2), (1, math.inf, 2)):
            with self.subTest(size=size), self.assertRaises(ValueError):
                check_render_size(*size)

    def test_later_oversized_page_blocks_all_rendering(self):
        doc, first = document(count=2)
        _, large = document(5001, 1)
        doc.__getitem__.side_effect = [first, large]
        with self.assertRaises(ValueError):
            check_geometry(doc, [1, 2], 2)
        first.render.assert_not_called()
        large.render.assert_not_called()
        first.close.assert_called_once()
        large.close.assert_called_once()

    def test_selected_pages_are_validated_before_opening(self):
        doc, page = document(count=2)
        for pages in ([], [0], [3], [True], [1, 1], [2, 1]):
            with self.subTest(pages=pages), self.assertRaises(ValueError):
                check_geometry(doc, pages, 2)
        doc.__getitem__.assert_not_called()

    def test_file_bounds_without_large_allocations(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "large.pdf"
            with file.open("wb") as stream:
                stream.truncate(50 * 1024 * 1024 + 1)
            with self.assertRaises(ValueError):
                check_file(file)
            with self.assertRaises(ValueError):
                check_file(folder)


class NativeBridge(unittest.TestCase):
    def setUp(self):
        self.runtime = NS(classify_pdf=Mock(return_value=NS(page_count=1)),
            extract_pages_markdown=Mock(), process_pdf_with_ocr=Mock())

    def test_preflight_precedes_extraction(self):
        self.runtime.classify_pdf.return_value.page_count = 501
        with patch.dict(sys.modules, {"pdf_inspector": self.runtime}), patch.object(native, "check_file"):
            with self.assertRaises(ValueError):
                native.extract("fixture.pdf", False)
        self.runtime.extract_pages_markdown.assert_not_called()
        self.runtime.process_pdf_with_ocr.assert_not_called()

    def test_native_page_number_and_warning_mapping(self):
        self.runtime.extract_pages_markdown.return_value = NS(pages=[
            NS(page=0, markdown="Tax invoice", needs_ocr=False, ocr_reason=None),
            NS(page=1, markdown="", needs_ocr=True, ocr_reason="image_only")])
        with patch.dict(sys.modules, {"pdf_inspector": self.runtime}), patch.object(native, "check_file"):
            rows = native.extract("fixture.pdf", False)
        self.assertEqual([r["page"] for r in rows], [1, 2])
        self.assertEqual(rows[1]["warnings"], ["image_only"])
        self.assertEqual(rows[1]["extraction"], "needs_ocr")

    def test_ocr_geometry_precedes_runtime_and_uses_offline_mode(self):
        doc, _ = document()
        self.runtime.process_pdf_with_ocr.return_value = NS(pages=[NS(page_number=1, markdown="Read text",
            provenance=NS(hosted_recommended=False, source="ocr", warnings=["check_quality"]))])
        with patch.dict(sys.modules, {"pdf_inspector": self.runtime, "pypdfium2": NS(PdfDocument=Mock(return_value=doc))}), patch.object(native, "check_file"):
            rows = native.extract("fixture.pdf", True)
        self.runtime.process_pdf_with_ocr.assert_called_once_with("fixture.pdf", offline=True, dpi=150)
        self.assertEqual(rows[0]["ocrEngine"], "pdf-inspector-pp-ocrv6-small")
        self.assertEqual(rows[0]["warnings"], ["check_quality"])

    def test_oversized_geometry_never_reaches_ocr(self):
        doc, page = document(width=20000)
        with patch.dict(sys.modules, {"pdf_inspector": self.runtime, "pypdfium2": NS(PdfDocument=Mock(return_value=doc))}), patch.object(native, "check_file"):
            with self.assertRaises(ValueError):
                native.extract("fixture.pdf", True)
        self.runtime.process_pdf_with_ocr.assert_not_called()
        page.render.assert_not_called()


class PaddleBridge(unittest.TestCase):
    def test_batch_loads_once_and_isolates_document_failures(self):
        jobs = [{"file": name, "pages": [1]} for name in ("a.pdf", "b.pdf", "c.pdf")]
        with patch.object(paddle, "load_pipeline", return_value="pipeline") as load_model, patch.object(paddle, "extract", side_effect=[[{"page": 1}], ValueError("private"), [{"page": 1}]]) as extract:
            result = paddle.extract_batch(jobs, "models")
        load_model.assert_called_once_with("models")
        self.assertEqual(result, [[{"page": 1}], None, [{"page": 1}]])
        self.assertEqual(extract.call_args_list[-1].args, ("c.pdf", [1], "pipeline"))

    def test_invalid_batch_never_loads_models(self):
        cases = [[], [{}], [{"file": "a", "pages": [True]}], [{"file": "a", "pages": [2, 1]}],
            [{"file": "a", "pages": list(range(1, 502))}], [{"file": "a", "pages": [1]}] * 51]
        with patch.object(paddle, "load_pipeline") as load_model:
            for jobs in cases:
                with self.subTest(jobs=len(jobs)), self.assertRaises(ValueError):
                    paddle.extract_batch(jobs, "models")
            load_model.assert_not_called()

    def test_missing_models_refuse_before_import_and_block_python_networking(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(paddle.os, "environ", {}), patch.object(socket, "create_connection"), patch.object(socket.socket, "connect"), patch.object(socket.socket, "connect_ex"):
            with self.assertRaisesRegex(ValueError, "model file"):
                paddle.load_pipeline(folder)
            with self.assertRaisesRegex(RuntimeError, "disabled"):
                socket.create_connection(("example.invalid", 443))

    def test_paddle_confidence_mapping_and_cleanup(self):
        doc, page = document()
        pipeline = Mock()
        pipeline.predict.return_value = [NS(json={"res": {"rec_texts": ["Tax invoice", "GST 10\nTotal 110", "Footer"], "rec_scores": [0.99, 0.98, 0.3]}})]
        modules = {"numpy": NS(asarray=Mock(return_value=MagicMock())), "pypdfium2": NS(PdfDocument=Mock(return_value=doc))}
        with patch.dict(sys.modules, modules), patch.object(paddle, "check_file"):
            rows = paddle.extract("fixture.pdf", [1], pipeline)
        self.assertEqual(rows[0]["ocrLineConfidence"], [0.99, 0.98, 0.98, 0.3])
        self.assertEqual(rows[0]["warnings"], ["paddle_low_confidence_lines"])
        page.render.return_value.close.assert_called_once()

    def test_paddle_render_failure_closes_page(self):
        doc, page = document()
        page.render.side_effect = RuntimeError("private")
        modules = {"numpy": NS(), "pypdfium2": NS(PdfDocument=Mock(return_value=doc))}
        with patch.dict(sys.modules, modules), patch.object(paddle, "check_file"):
            with self.assertRaises(RuntimeError):
                paddle.extract("fixture.pdf", [1], Mock())
        self.assertEqual(page.close.call_count, 2)  # Preflight handle and rendering handle.

    def test_paddle_rejects_missing_or_invalid_recognition_results(self):
        for results in ([], [NS(json={"res": {"rec_texts": ["text"], "rec_scores": []}})],
                [NS(json={"res": {"rec_texts": ["text"], "rec_scores": [math.nan]}})]):
            doc, page = document()
            pipeline = Mock()
            pipeline.predict.return_value = results
            modules = {"numpy": NS(asarray=Mock(return_value=MagicMock())), "pypdfium2": NS(PdfDocument=Mock(return_value=doc))}
            with self.subTest(results=len(results)), patch.dict(sys.modules, modules), patch.object(paddle, "check_file"):
                with self.assertRaises(ValueError):
                    paddle.extract("fixture.pdf", [1], pipeline)
            page.render.return_value.close.assert_called_once()

    def test_empty_paddle_text_stays_flagged(self):
        doc, _ = document()
        pipeline = Mock()
        pipeline.predict.return_value = [NS(json={"res": {"rec_texts": [], "rec_scores": []}})]
        modules = {"numpy": NS(asarray=Mock(return_value=MagicMock())), "pypdfium2": NS(PdfDocument=Mock(return_value=doc))}
        with patch.dict(sys.modules, modules), patch.object(paddle, "check_file"):
            rows = paddle.extract("fixture.pdf", [1], pipeline)
        self.assertEqual(rows[0]["text"], "")
        self.assertEqual(rows[0]["warnings"], ["paddle_ocr_requires_review"])
        self.assertEqual(rows[0]["ocrLineConfidence"], [0.0])

    def test_paddle_geometry_rejects_before_prediction(self):
        doc, page = document(width=20000)
        pipeline = Mock()
        with patch.dict(sys.modules, {"numpy": NS(), "pypdfium2": NS(PdfDocument=Mock(return_value=doc))}), patch.object(paddle, "check_file"):
            with self.assertRaises(ValueError):
                paddle.extract("fixture.pdf", [1], pipeline)
        page.render.assert_not_called()
        pipeline.predict.assert_not_called()


if __name__ == "__main__":
    unittest.main()
