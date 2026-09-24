"""Standalone OCR CLI: Image -> OCR -> Text.

Usage (from metcheck-ai/):
    python ocr.py <image_path>

Prints the extracted text plus mean confidence and word/block counts.
Uses the same engine as the FastAPI service (OpenCV preprocessing +
Tesseract). Needs the Tesseract binary (see README).
"""
import argparse
import importlib.util
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
AI = os.path.join(BASE, "ai-service")

def _load(mod_name, rel_path):
    # Load by file path: this file is named ocr.py, so a plain
    # `import ocr.ocr_engine` would resolve to itself instead of ocr/.
    spec = importlib.util.spec_from_file_location(mod_name, os.path.join(AI, rel_path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod

_cv = _load("ocr_cli_preprocess", os.path.join("image_processing", "preprocess_yolo.py"))
try:
    _cv_fallback = _load("ocr_cli_preprocess_cv", os.path.join("image_processing", "preprocess_cv.py"))
except Exception:
    _cv_fallback = None
_ocr = _load("ocr_cli_engine", os.path.join("ocr", "ocr_engine.py"))
preprocess, new_image_id = _cv.preprocess, _cv.new_image_id
run_ocr_detailed = _ocr.run_ocr_detailed


def ocr_image(path: str):
    with open(path, "rb") as fh:
        raw = fh.read()
    image_id = new_image_id()
    try:
        proc = preprocess(raw, image_id)
    except Exception:
        if _cv_fallback is None:
            raise
        proc = _cv_fallback.preprocess(raw, image_id)
    from PIL import Image
    variants = {k: Image.fromarray(v) for k, v in (proc.get("variants") or {}).items()}
    result = run_ocr_detailed(Image.fromarray(proc["image"]), variants=variants)
    # Clean up the cached processed copies; the API keeps originals itself.
    try:
        os.remove(os.path.join(BASE, "ai-service", "storage", proc["processed_path"]))
    except OSError:
        pass
    try:
        if proc.get("processed_path_thresh"):
            os.remove(os.path.join(BASE, "ai-service", "storage", proc["processed_path_thresh"]))
    except OSError:
        pass
    return result


def main():
    ap = argparse.ArgumentParser(description="Image -> OCR -> Text")
    ap.add_argument("image", help="Path to the package label image")
    args = ap.parse_args()
    if not os.path.exists(args.image):
        print(f"File not found: {args.image}")
        sys.exit(1)
    result = ocr_image(args.image)
    print(f"--- text (engine: {result['engine']}, confidence: {result['confidence']}) ---")
    print(result["text"] or "(no text detected)")
    print(f"--- words: {len(result['words'])}, blocks: {len(result['blocks'])} ---")


if __name__ == "__main__":
    main()
