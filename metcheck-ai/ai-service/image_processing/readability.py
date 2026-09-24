"""Measurement-assisted readability assessment.

Uses OCR confidence, text bounding boxes, character pixel height,
image resolution, blur and contrast. Reports pixel measurements only —
physical millimetre claims require a reliable scale reference.
"""
import statistics
from typing import Dict, Any, List

try:
    import cv2  # optional: used for blur score when available
    _HAS_CV2 = True
except Exception:
    cv2 = None
    _HAS_CV2 = False


def _blur_score(gray_image) -> float:
    """Variance of Laplacian (focus measure). Numpy fallback when no cv2."""
    try:
        import numpy as np
        arr = np.asarray(gray_image, dtype=float)
        if _HAS_CV2:
            return float(cv2.Laplacian(arr.astype("uint8") if arr.max() <= 255 else arr,
                                       cv2.CV_64F).var())
        # Numpy-only Laplacian: kernel [[0,1,0],[1,-4,1],[0,1,0]]
        inner = arr[1:-1, 1:-1] * -4 + arr[:-2, 1:-1] + arr[2:, 1:-1] + arr[1:-1, :-2] + arr[1:-1, 2:]
        return float(inner.var())
    except Exception:
        return 100.0  # neutral: don't flag blur when unmeasurable


def assess_readability(words: List[Dict[str, Any]], gray_image, ocr_confidence: float,
                       pixels_per_mm: float = None) -> Dict[str, Any]:
    h, w = gray_image.shape[:2]
    resolution = {"width": int(w), "height": int(h)}
    blur = _blur_score(gray_image)
    try:
        import numpy as _np
        contrast = float(_np.asarray(gray_image).std())
    except Exception:
        contrast = 0.0

    heights = [wd["box"]["h"] for wd in (words or []) if wd.get("box", {}).get("h", 0) > 0]
    median_char_px = round(statistics.median(heights), 1) if heights else 0
    avg_conf = round(ocr_confidence or 0, 3)

    if not words:
        return {
            "status": "UNABLE",
            "label": "Unable to determine",
            "metrics": {"ocr_confidence": avg_conf, "median_char_height_px": 0,
                        "resolution": resolution, "blur_score": round(blur, 1),
                        "contrast": round(contrast, 1)},
            "issues": ["No text regions detected by OCR."],
            "fontSize": {"status": "MANUAL_REVIEW_REQUIRED",
                         "note": "Physical font size could not be reliably determined from this image."},
        }

    issues = []
    if avg_conf < 0.6:
        issues.append(f"Low OCR confidence ({avg_conf}).")
    if median_char_px and median_char_px < 12:
        issues.append(f"Very small text (median {median_char_px}px character height).")
    # NOTE: blur/contrast are measured on the denoised + CLAHE-enhanced copy,
    # which smooths edges and shifts absolute scores, so thresholds must stay
    # conservative. More importantly, a confident OCR read proves the text
    # resolved — never call a clearly-read image "blurry" on a proxy metric
    # alone. Only raise blur/low-contrast when OCR itself struggled.
    ocr_struggled = avg_conf < 0.75
    if blur < 25 and ocr_struggled:
        issues.append(f"Image appears blurry (focus score {round(blur, 1)}).")
    if contrast < 18 and ocr_struggled:
        issues.append(f"Low contrast ({round(contrast, 1)}).")
    if w < 600 or h < 600:
        issues.append(f"Low resolution ({w}x{h}).")

    if not issues:
        status, label = "READABLE", "Readable"
    elif len(issues) == 1:
        status, label = "POTENTIAL_ISSUE", "Potential readability issue"
    else:
        status, label = "MANUAL_REVIEW", "Manual review required"

    if pixels_per_mm:
        font_size = {"status": "MEASURED",
                     "note": f"Median character height ≈ {round(median_char_px / pixels_per_mm, 1)} mm (using supplied scale)."}
    else:
        font_size = {"status": "MANUAL_REVIEW_REQUIRED",
                     "note": "Physical font size could not be reliably determined from this image."}

    return {
        "status": status, "label": label,
        "metrics": {"ocr_confidence": avg_conf, "median_char_height_px": median_char_px,
                    "resolution": resolution, "blur_score": round(blur, 1),
                    "contrast": round(contrast, 1)},
        "issues": issues, "fontSize": font_size,
    }
