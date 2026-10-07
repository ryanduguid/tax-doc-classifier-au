"""Generate fabricated integration fixtures; extraction uses pdf-inspector only."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont, ImageFilter

root = Path(__file__).resolve().parent.parent / "eval" / "au" / "pdf"
root.mkdir(exist_ok=True)
invoice = ["Tax invoice", "SYNTHETIC TEST DOCUMENT", "Example supplies", "GST 10.00", "Total due 110.00"]
bank = ["Bank statement", "SYNTHETIC TEST DOCUMENT", "Transaction account", "Opening balance 1000", "Deposits 100", "Closing balance 1100"]


def small_print_rows():
    # scripts/test-au-pdf.ts rebuilds these rows to check the OCR text.
    return [f"{day:02d}/09/2026 Card purchase {day * 7919 % 9000 + 100}.{day * 37 % 100:02d}" for day in range(1, 31)]


def page(c, lines):
    for i, line in enumerate(lines):
        c.drawString(50, 780 - i * 28, line)
    c.showPage()


c = canvas.Canvas(str(root / "native-pack.pdf"), pagesize=(595, 842), invariant=True)
page(c, invoice)
page(c, bank)
page(c, ["Internal correspondence", "SYNTHETIC TEST DOCUMENT", "Please request a dividend statement."])
c.save()

image = Image.new("RGB", (1190, 1684), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("DejaVuSans.ttf", 32)
for i, line in enumerate(invoice):
    draw.text((100, 120 + i * 65), line, fill="black", font=font)
image.save(root / "scan-preview.png")
c = canvas.Canvas(str(root / "scan.pdf"), pagesize=(595, 842), invariant=True)
c.drawImage(ImageReader(image), 0, 0, width=595, height=842)
c.showPage()
c.save()

c = canvas.Canvas(str(root / "empty.pdf"), pagesize=(595, 842), invariant=True)
c.showPage()
c.save()

for name, raster in [
    ("scan-skewed.pdf", image.rotate(3, resample=Image.Resampling.BICUBIC, fillcolor="white").filter(ImageFilter.GaussianBlur(0.5))),
    ("scan-sideways.pdf", image.rotate(90, expand=True)),
]:
    c = canvas.Canvas(str(root / name), pagesize=(595, 842), invariant=True)
    c.drawImage(ImageReader(raster), 0, 0, width=595, height=842, preserveAspectRatio=True, anchor="c")
    c.showPage()
    c.save()

# 5 pt rows scanned at 300 dpi: OCR rendered at pdf-inspector's 150 dpi default dropped 6 to 8 of the 30 in testing.
small = Image.new("L", (2480, 3508), "white")
draw = ImageDraw.Draw(small)
font = ImageFont.truetype("DejaVuSans.ttf", 21)
for i, line in enumerate(bank[:3] + small_print_rows()):
    draw.text((200, 250 + i * 28), line, fill="black", font=font)
c = canvas.Canvas(str(root / "scan-small-print.pdf"), pagesize=(595, 842), invariant=True)
c.drawImage(ImageReader(small), 0, 0, width=595, height=842)
c.showPage()
c.save()
print("Created 6 synthetic PDF fixtures")
