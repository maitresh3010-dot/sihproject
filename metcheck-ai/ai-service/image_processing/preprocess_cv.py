"""OpenCV preprocessing for package-label OCR.

Key insight: a single aggressive binarization destroys text on colourful /
glossy packaging. So we keep the ORIGINAL untouched and derive TWO OCR
variants from it:

  * ``clean`` — upscale + grayscale + denoise + CLAHE contrast. No
    thresholding. This is the primary OCR input and works best with
    Tesseract on real photos.
  * ``thresh`` — the same, plus adaptive-Gaussian threshold. Helps with
    uneven lighting / shadows.

The OCR engine tries both (plus several page-segmentation modes) and
keeps the best-scoring result. EXIF orientation is honoured so phone
photos are upright before OCR.
"""
import cv2
import numpy as np
import io
import os
import uuid

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "storage")
ORIGINALS_DIR = os.path.join(STORAGE_DIR, "originals")
PROCESSED_DIR = os.path.join(STORAGE_DIR, "processed")

TARGET_LONG_SIDE = 2000  # upscale small phone photos; cap to avoid OOM
MAX_LONG_SIDE = 3000


def _ensure_dirs():
    os.makedirs(ORIGINALS_DIR, exist_ok=True)
    os.makedirs(PROCESSED_DIR, exist_ok=True)


def new_image_id() -> str:
    return f"{uuid.uuid4().hex}"


def save_original(image_bytes: bytes, image_id: str) -> str:
    """Store the original image byte-for-byte. Returns the relative path."""
    _ensure_dirs()
    rel = os.path.join("originals", f"{image_id}.bin")
    with open(os.path.join(STORAGE_DIR, rel), "wb") as fh:
        fh.write(image_bytes)
    return rel.replace(os.sep, "/")


def _decode_upright(image_bytes: bytes):
    """Decode with EXIF-orientation applied (phone photos are often rotated).

    cv2.imdecode ignores EXIF, so decode via PIL first (which honours it
    with ImageOps.exif_transpose) and convert to BGR for OpenCV.
    Falls back to plain cv2 decode.
    """
    try:
        from PIL import Image, ImageOps
        pil = Image.open(io.BytesIO(image_bytes))
        pil = ImageOps.exif_transpose(pil)
        if pil.mode not in ("RGB", "L"):
            pil = pil.convert("RGB")
        else:
            pil = pil.convert("RGB")
        arr = np.array(pil)
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    except Exception:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _deskew(gray):
    """Correct small camera tilt (fast Hough-based, ~50ms).

    Returns (image, angle). Only applies when a clear dominant near-horizontal
    text direction of 0.5–15 degrees is found; larger rotations are left to
    the OCR engine's OSD/rotation handling.
    """
    try:
        h, w = gray.shape
        sw = 800
        small = cv2.resize(gray, (sw, max(1, int(h * sw / w)))) if w > sw else gray
        edges = cv2.Canny(small, 50, 200)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 100,
                                minLineLength=100, maxLineGap=10)
        if lines is None or len(lines) < 5:
            return gray, 0.0
        angles = []
        for x1, y1, x2, y2 in lines[:, 0]:
            a = float(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
            if a < -45:
                a += 90
            elif a > 45:
                a -= 90
            if abs(a) < 20:
                angles.append(a)
        if len(angles) < 5:
            return gray, 0.0
        skew = float(np.median(angles))
        if abs(skew) < 0.5 or abs(skew) > 15:
            return gray, 0.0
        M = cv2.getRotationMatrix2D((w / 2, h / 2), skew, 1.0)
        fixed = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)
        return fixed, round(skew, 2)
    except Exception:
        return gray, 0.0


def _upscale_gray(gray):
    h, w = gray.shape
    long_side = max(h, w)
    scale = 1.0
    if long_side < TARGET_LONG_SIDE:
        scale = TARGET_LONG_SIDE / long_side
        # never upscale beyond MAX_LONG_SIDE
        if max(h, w) * scale > MAX_LONG_SIDE:
            scale = MAX_LONG_SIDE / max(h, w)
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)),
                          interpolation=cv2.INTER_CUBIC)
    elif long_side > MAX_LONG_SIDE:
        scale = MAX_LONG_SIDE / long_side
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)),
                          interpolation=cv2.INTER_AREA)
    return gray, scale


def _enhance(gray):
    """Light denoise (edge-preserving) + CLAHE contrast. Fast path."""
    # bilateral is far faster than fastNlMeans and preserves text edges
    try:
        denoised = cv2.bilateralFilter(gray, 5, 50, 50)
    except Exception:
        denoised = gray
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    try:
        return clahe.apply(denoised)
    except Exception:
        return denoised


def _threshold(enhanced):
    # block size scales with image size so small/large labels behave alike
    h, w = enhanced.shape
    block = 31
    if max(h, w) > 2000:
        block = 51
    elif max(h, w) < 1000:
        block = 21
    if block % 2 == 0:
        block += 1
    return cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, 10
    )


def preprocess(image_bytes: bytes, image_id: str) -> dict:
    """Decode -> upright -> grayscale -> upscale -> enhance (+ threshold copy).

    Returns dict with ``image`` (primary clean array for OCR), ``variants``
    (clean + thresh arrays), ``processed_path`` (primary saved copy, backward
    compatible) and ``meta``. Both variants are saved under storage/processed.
    """
    _ensure_dirs()
    img = _decode_upright(image_bytes)
    if img is None:
        raise ValueError("Unreadable image file")
    orig_h, orig_w = img.shape[:2]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray, deskew_angle = _deskew(gray)
    gray, scale = _upscale_gray(gray)
    enhanced = _enhance(gray)
    thresh = _threshold(enhanced)

    rel_clean = os.path.join("processed", f"{image_id}.png")
    rel_thresh = os.path.join("processed", f"{image_id}_thresh.png")
    cv2.imwrite(os.path.join(STORAGE_DIR, rel_clean), enhanced)
    cv2.imwrite(os.path.join(STORAGE_DIR, rel_thresh), thresh)

    return {
        # backward compatible: primary processed copy + array
        "processed_path": rel_clean.replace(os.sep, "/"),
        "processed_path_thresh": rel_thresh.replace(os.sep, "/"),
        "image": enhanced,
        "variants": {"clean": enhanced, "thresh": thresh},
        "meta": {
            "original_width": int(orig_w), "original_height": int(orig_h),
            "scale": round(float(scale), 3),
            "deskew_angle": float(deskew_angle),
            "steps": ["exif-upright", "grayscale", "deskew", "resize",
                      "bilateral-denoise", "clahe-contrast",
                      "adaptive-threshold-copy"],
            "variants": ["clean", "thresh"],
        },
    }
