#!/usr/bin/env python3
"""Render Cerbyl legal PDFs and make contact sheets for visual QA."""

from pathlib import Path
import math

import pypdfium2 as pdfium
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "output" / "pdf"
RENDER_DIR = ROOT / "tmp" / "pdfs"
RENDER_DIR.mkdir(parents=True, exist_ok=True)

for pdf_path in sorted(PDF_DIR.glob("cerbyl-*.pdf")):
    pdf = pdfium.PdfDocument(str(pdf_path))
    pages = []
    for index, page in enumerate(pdf):
        image = page.render(scale=1.35).to_pil().convert("RGB")
        page_path = RENDER_DIR / f"{pdf_path.stem}-page-{index + 1}.png"
        image.save(page_path)
        pages.append(image)

    thumb_width = 420
    thumbs = []
    for image in pages:
        ratio = thumb_width / image.width
        thumbs.append(image.resize((thumb_width, int(image.height * ratio))))
    gap, label_height = 24, 42
    cols = min(2, len(thumbs))
    rows = math.ceil(len(thumbs) / cols)
    cell_height = max(image.height for image in thumbs) + label_height
    sheet = Image.new("RGB", (cols * thumb_width + (cols + 1) * gap, rows * cell_height + (rows + 1) * gap), "#d8d5cf")
    draw = ImageDraw.Draw(sheet)
    for index, image in enumerate(thumbs):
        col, row = index % cols, index // cols
        x = gap + col * (thumb_width + gap)
        y = gap + row * (cell_height + gap)
        sheet.paste(image, (x, y + label_height))
        draw.text((x, y + 10), f"Page {index + 1}", fill="#171411")
    sheet_path = RENDER_DIR / f"{pdf_path.stem}-contact-sheet.png"
    sheet.save(sheet_path)
    print(f"{pdf_path.name}: {len(pages)} page(s) -> {sheet_path}")
