"""LegalMet AI service: OCR + declaration extraction + rule engine (FastAPI)."""
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os

from PIL import Image

from image_processing.preprocess_yolo import preprocess, save_original, new_image_id, STORAGE_DIR
try:
    from image_processing.preprocess_cv import preprocess as preprocess_cv  # fallback
except Exception:
    preprocess_cv = None
from image_processing.readability import assess_readability
from ocr.ocr_engine import run_ocr_detailed
from extraction.declarations import extract_declarations
from rules.engine import load_rules, evaluate

STATUS_LABELS = {
    "COMPLIANT": "Compliant",
    "POTENTIAL_VIOLATION": "Potential Violation",
    "MANUAL_REVIEW": "Manual Review Required",
    "UNABLE_TO_VERIFY": "Unable to Verify",
}

# OCR result cache: sha256(image bytes) -> OCR dict (text, confidence, words,
# blocks, engine, variant, psm, legibility). Repeat uploads of the same photo
# (re-scans, demo loop) skip Tesseract entirely. Preprocessing is
# deterministic for identical bytes, so cached word boxes stay valid.
# Bounded LRU of 32 entries; audit files (originals/processed) are still
# saved per request with fresh IDs.
from collections import OrderedDict
import hashlib
import copy as _copy

_OCR_CACHE: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
_OCR_CACHE_MAX = 32


def _ocr_cached(digest: str):
    try:
        res = _OCR_CACHE.get(digest)
        if res is None:
            return None
        _OCR_CACHE.move_to_end(digest)
        return _copy.deepcopy(res)
    except Exception:
        return None


def _ocr_store(digest: str, result: Dict[str, Any]):
    try:
        _OCR_CACHE[digest] = _copy.deepcopy(result)
        _OCR_CACHE.move_to_end(digest)
        while len(_OCR_CACHE) > _OCR_CACHE_MAX:
            _OCR_CACHE.popitem(last=False)
    except Exception:
        pass

app = FastAPI(title="LegalMet AI Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/images", StaticFiles(directory=STORAGE_DIR), name="images")


class TextPayload(BaseModel):
    text: str
    category: str = "general"
    ocr_confidence: float = 1.0
    rules: Optional[List[Dict[str, Any]]] = None


def _with_labels(report: Dict[str, Any]) -> Dict[str, Any]:
    report["verdict"] = STATUS_LABELS.get(report.get("status"), "Unable to Verify")
    report["disclaimer"] = "AI-assisted screening only. Not a legally binding determination."
    return report


def _preprocess(raw: bytes, image_id: str) -> dict:
    """YOLO-crop (PIL) first; legacy OpenCV path only as a last-resort fallback."""
    try:
        return preprocess(raw, image_id)
    except Exception:
        if preprocess_cv is None:
            raise
        return preprocess_cv(raw, image_id)


@app.get("/health")
def health():
    return {"status": "ok", "service": "legalmet-ai"}


@app.get("/rules")
def get_rules():
    return load_rules()


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    """OCR endpoint. Stores the original image untouched plus processed copies."""
    raw = await file.read()
    image_id = new_image_id()
    original_path = save_original(raw, image_id)
    proc = _preprocess(raw, image_id)
    variants = {k: Image.fromarray(v) for k, v in (proc.get("variants") or {}).items()}
    pil = Image.fromarray(proc["image"])
    result = run_ocr_detailed(pil, variants=variants)
    readability = assess_readability(result["words"], proc["image"], result["confidence"])
    return {
        "image_id": image_id,
        "original_image": f"/images/{original_path}",
        "processed_image": f"/images/{proc['processed_path']}",
        "processed_image_thresh": f"/images/{proc.get('processed_path_thresh', '')}",
        "preprocessing": proc["meta"],
        "image_width": int(proc["image"].shape[1]),
        "image_height": int(proc["image"].shape[0]),
        "text": result["text"],
        "confidence": result["confidence"],
        "blocks": result["blocks"],
        "words": result["words"][:300],
        "readability": readability,
        "engine": result["engine"],
        "ocr_variant": result.get("ocr_variant"),
        "ocr_psm": result.get("ocr_psm"),
        "legible": result.get("legible", True),
        "warning": result.get("warning"),
    }


@app.post("/extract")
def extract(payload: TextPayload):
    """Declaration extraction endpoint (structured fields, never invented)."""
    return {"declarations": extract_declarations(payload.text or "", payload.ocr_confidence)}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...), category: str = Form("general")):
    raw = await file.read()
    image_id = new_image_id()
    original_path = save_original(raw, image_id)
    digest = hashlib.sha256(raw).hexdigest()
    ocr = _ocr_cached(digest)
    from_cache = ocr is not None
    proc = _preprocess(raw, image_id)
    if ocr is None:
        variants = {k: Image.fromarray(v) for k, v in (proc.get("variants") or {}).items()}
        pil = Image.fromarray(proc["image"])
        ocr = run_ocr_detailed(pil, variants=variants)
        _ocr_store(digest, ocr)
    declarations = extract_declarations(ocr.get("text", ""), ocr.get("confidence", 0) or 0.75)
    readability = assess_readability(ocr.get("words", []), proc["image"], ocr.get("confidence", 0))
    rules = load_rules()
    report = _with_labels(evaluate(declarations, rules, category))
    return {
        "image_id": image_id,
        "original_image": f"/images/{original_path}",
        "processed_image": f"/images/{proc['processed_path']}",
        "image_width": int(proc["image"].shape[1]),
        "image_height": int(proc["image"].shape[0]),
        "ocr_text": ocr.get("text", ""),
        "ocr_confidence": ocr.get("confidence", 0),
        "ocr_blocks": ocr.get("blocks", []),
        "ocr_words": ocr.get("words", [])[:300],
        "ocr_engine": ocr.get("engine", ""),
        "ocr_variant": ocr.get("ocr_variant"),
        "ocr_psm": ocr.get("ocr_psm"),
        "legible": ocr.get("legible", True),
        "warning": ocr.get("warning"),
        "cached": from_cache,
        "readability": readability,
        "declarations": declarations,
        **report,
    }


@app.post("/evaluate")
def evaluate_text(payload: TextPayload):
    declarations = extract_declarations(payload.text or "", payload.ocr_confidence)
    rules = payload.rules or load_rules()
    report = _with_labels(evaluate(declarations, rules, payload.category))
    return {"declarations": declarations, **report}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("AI_PORT", "8001")))
