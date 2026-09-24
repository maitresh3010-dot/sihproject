# dataset/pdf

Official Legal Metrology reference PDF(s):

  legal_metrology.pdf

Extract text (with Tesseract OCR fallback for scanned pages) via, from `metcheck-ai/`:

  python dataset/extract_pdf.py [--max-pages=N] [--ocr-lang=eng]

which writes `dataset/ocr/legal_metrology.txt` + `dataset/ocr/pages.json`.
Then identify relevant sections:

  python dataset/extract_sections.py

and human-verify candidates into structured rules:

  python dataset/review_rules.py

Only official source material belongs here — do not commit scanned
package labels containing personal data.
