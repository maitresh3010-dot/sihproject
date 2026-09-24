"""Step 1 — PDF -> text (with OCR fallback for scanned pages).

Usage (from metcheck-ai/):
    python dataset/extract_pdf.py [pdf_path] [--ocr-lang eng]

Writes:
    dataset/ocr/legal_metrology.txt   (page-separated plain text)
    dataset/ocr/pages.json            ([{page, text, ocr_used}])

Pages whose text layer yields almost nothing are rendered at 300 DPI via
PyMuPDF and OCR'd with Tesseract (the "PDF -> OCR" leg).
"""
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
MIN_CHARS_FOR_TEXT_LAYER = 50

# Resolve the Tesseract binary the same way the AI service does.
# NOTE: a plain `import ocr.ocr_engine` is fragile here -- this repo has a
# top-level `ocr.py` that shadows the `ai-service/ocr/` directory on
# sys.path, and that directory has no `__init__.py`, so the import fails with
# `ModuleNotFoundError: No module named 'ocr.ocr_engine'`. Load by file path
# instead (same approach as metcheck-ai/ocr.py).
def _ensure_tesseract_cmd():
    import importlib.util
    engine_path = os.path.join(BASE, "..", "ai-service", "ocr", "ocr_engine.py")
    try:
        spec = importlib.util.spec_from_file_location(
            "extract_pdf_ocr_engine", os.path.abspath(engine_path)
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    except Exception:
        pass


_ensure_tesseract_cmd()


def page_text_native(page) -> str:
    try:
        return page.get_text("text") or ""
    except Exception:
        return ""


def page_text_ocr(page, lang="eng") -> str:
    import io
    import pytesseract
    from PIL import Image
    pix = page.get_pixmap(dpi=300)
    # pix.samples assumes plain RGB; pages with alpha/transparency need a
    # proper encode, otherwise Image.frombytes raises ValueError.
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    try:
        return pytesseract.image_to_string(img, lang=lang) or ""
    except Exception as e:
        print(f"  OCR failed on a page: {e}")
        return ""


def main():
    argv = sys.argv[1:]
    args: list = []
    lang = "eng"
    max_pages = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--ocr-lang="):
            lang = a.split("=", 1)[1]
        elif a == "--ocr-lang" and i + 1 < len(argv):
            i += 1
            lang = argv[i]
        elif a.startswith("--max-pages="):
            max_pages = int(a.split("=", 1)[1])
        elif a == "--max-pages" and i + 1 < len(argv):
            i += 1
            max_pages = int(argv[i])
        elif not a.startswith("--"):
            args.append(a)
        i += 1
    src = args[0] if args else os.path.join(BASE, "pdf", "legal_metrology.pdf")
    if not os.path.exists(src):
        print(f"Reference PDF not found: {src}")
        print("Place the official Legal Metrology PDF at dataset/pdf/legal_metrology.pdf first.")
        sys.exit(1)
    import pymupdf
    doc = pymupdf.open(src)
    pages, ocr_pages = [], 0
    total = len(doc) if max_pages is None else min(len(doc), max_pages)
    for i in range(total):
        page = doc[i]
        text = page_text_native(page).strip()
        ocr_used = False
        if len(text) < MIN_CHARS_FOR_TEXT_LAYER:
            text = page_text_ocr(page, lang).strip()
            ocr_used = True
            ocr_pages += 1
        pages.append({"page": i + 1, "text": text, "ocr_used": ocr_used})
    txt_path = os.path.join(BASE, "ocr", "legal_metrology.txt")
    json_path = os.path.join(BASE, "ocr", "pages.json")
    os.makedirs(os.path.dirname(txt_path), exist_ok=True)
    with open(txt_path, "w", encoding="utf-8") as fh:
        fh.write("\n\n\f\n\n".join(p["text"] for p in pages))
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(pages, fh, ensure_ascii=False, indent=1)
    total_chars = sum(len(p["text"]) for p in pages)
    print(f"Extracted {len(pages)} pages, {total_chars} chars "
          f"({ocr_pages} via OCR) -> {txt_path}, {json_path}")


if __name__ == "__main__":
    main()
