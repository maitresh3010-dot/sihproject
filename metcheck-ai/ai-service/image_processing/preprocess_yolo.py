"""YOLO + PIL preprocessing for package-label OCR (no OpenCV).

Replaces ``preprocess_cv.py`` (grayscale/denoise/CLAHE/threshold/deskew):

  1. Decode upright (EXIF honoured) -> RGB PIL.
  2. YOLO detects the label/declaration-panel ROI; crop to the largest box
     (with 4% padding). No detection -> full image (graceful fallback).
  3. Grayscale + autocontrast + LANCZOS upscale to ~2000px long side.
  4. Save the YOLO crop under ``storage/processed/`` for the UI evidence tab.

Return shape mirrors ``preprocess_cv.preprocess`` so ``main.py`` / ``ocr.py``
need no other changes: ``image`` + ``variants["clean"]`` are numpy (H, W)
uint8 arrays, ``processed_path`` points at the saved crop.
"""
import io
import os
import uuid

import numpy as np
from PIL import Image, ImageOps

from .detect_yolo import detect_boxes

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "storage")
ORIGINALS_DIR = os.path.join(STORAGE_DIR, "originals")
PROCESSED_DIR = os.path.join(STORAGE_DIR, "processed")

TARGET_LONG_SIDE = 2000
MAX_LONG_SIDE = 3000
CROP_PADDING = 0.04  # 4% padding around the YOLO box


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


def _decode_upright(image_bytes: bytes) -> Image.Image:
    pil = Image.open(io.BytesIO(image_bytes))
    pil = ImageOps.exif_transpose(pil)
    return pil.convert("RGB")


def _skin_margin_crop(rgb: Image.Image):
    """Strip fingers/hands holding the packet at the frame edges (no OpenCV).

    Classic failure: the photo shows the label clearly, but fingers cover
    30-40% of the frame, so the declaration text is tiny after Tesseract's
    internal downscale and OCR returns fragments. Skin pixels are found with
    a YCrCb rule in numpy (red foil fails the Cb/Cr window, so packaging is
    safe); contiguous skin bands touching the left/right edge are removed.
    Returns (image, crop_box_or_None). No-op when no edge skin band exists.
    """
    try:
        import numpy as np
        w, h = rgb.size
        if w < 400:
            return rgb, None
        sw = 300
        small = rgb.resize((sw, max(1, int(h * sw / w))))
        a = np.asarray(small).astype(float)
        R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
        Cr = 128 + 0.5 * R - 0.4187 * G - 0.0813 * B
        Cb = 128 - 0.1687 * R - 0.3313 * G + 0.5 * B
        skin = (Cr >= 133) & (Cr <= 173) & (Cb >= 77) & (Cb <= 127) & (R > 60)
        strict = skin & (G > 70) & (R < 245)  # lit skin; red foil fails G/Ranon
        darkskin = ((R > 60) & (R < 150) & (G > 40) & (G < 110)
                    & ((R - G) > 8) & ((R - G) < 45)
                    & (Cr >= 128) & (Cr <= 172) & (Cb >= 75) & (Cb <= 130))
        col_frac = (strict | darkskin).mean(axis=0)
        is_skin_col = col_frac > 0.40
        # Edge walk with gap tolerance: knuckle highlights split finger
        # columns, so allow up to 3 non-skin columns inside the band. No
        # mean-smoothing (it bleeds the finger band into the wrapper).
        THRESH_GAP, MIN_BAND = 3, int(sw * 0.05)

        def _walk(start, step):
            pos, last_skin, gap = start, start - step, 0
            while 0 <= pos < sw:
                if is_skin_col[pos]:
                    last_skin, gap = pos, 0
                else:
                    gap += 1
                    if gap > THRESH_GAP:
                        break
                pos += step
            return last_skin + step  # first non-band column

        left = _walk(0, 1)
        right = _walk(sw - 1, -1) + 1
        stripped_l, stripped_r = left, sw - right
        if (stripped_l < MIN_BAND and stripped_r < MIN_BAND):
            return rgb, None
        if (right - left) < int(sw * 0.55):  # keep >= 55% of width
            return rgb, None
        x1, x2 = int(left / sw * w), int(right / sw * w)
        if x2 - x1 < 200:
            return rgb, None
        return rgb.crop((x1, 0, x2, h)), {"x": x1, "y": 0, "w": x2 - x1, "h": h}
    except Exception:
        return rgb, None


def _crop_to_panel(rgb: Image.Image):
    """Crop to the largest YOLO box. Returns (image, box_or_None)."""
    boxes = detect_boxes(rgb)
    if not boxes:
        return rgb, None
    b = boxes[0]
    w, h = rgb.size
    pad_w = int(b["w"] * CROP_PADDING)
    pad_h = int(b["h"] * CROP_PADDING)
    x1 = max(0, b["x"] - pad_w)
    y1 = max(0, b["y"] - pad_h)
    x2 = min(w, b["x"] + b["w"] + pad_w)
    y2 = min(h, b["y"] + b["h"] + pad_h)
    if x2 - x1 < 50 or y2 - y1 < 50:  # degenerate box -> ignore
        return rgb, None
    return rgb.crop((x1, y1, x2, y2)), {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1,
                                        "conf": b.get("conf", 0), "cls": b.get("cls", -1)}


def _enhance(gray: Image.Image) -> Image.Image:
    return ImageOps.autocontrast(gray, cutoff=1)


def _contrast_boost(gray: Image.Image) -> Image.Image:
    """Stronger contrast for glossy/low-contrast foil packaging (PIL only)."""
    from PIL import ImageEnhance
    try:
        return ImageEnhance.Contrast(ImageOps.autocontrast(gray, cutoff=2)).enhance(2.0)
    except Exception:
        return gray


def _threshold(gray: Image.Image, cutoff: int = 140) -> Image.Image:
    """Fixed threshold copy for uneven lighting (PIL only, no OpenCV).

    White-on-colour print (e.g. white text on red foil) often resolves
    better binarized; the OCR engine tries all variants and keeps the best.
    """
    try:
        return gray.point(lambda p: 255 if p > cutoff else 0, mode="L")
    except Exception:
        return gray


def _upscale(gray: Image.Image) -> Image.Image:
    w, h = gray.size
    long_side = max(w, h)
    if long_side < TARGET_LONG_SIDE:
        s = TARGET_LONG_SIDE / long_side
        if max(w, h) * s > MAX_LONG_SIDE:
            s = MAX_LONG_SIDE / max(w, h)
        gray = gray.resize((int(w * s), int(h * s)), Image.LANCZOS)
    elif long_side > MAX_LONG_SIDE:
        s = MAX_LONG_SIDE / long_side
        gray = gray.resize((int(w * s), int(h * s)), Image.LANCZOS)
    return gray


def preprocess(image_bytes: bytes, image_id: str) -> dict:
    """YOLO-crop -> grayscale -> autocontrast -> upscale (PIL only, no cv2)."""
    _ensure_dirs()
    rgb = _decode_upright(image_bytes)
    if rgb is None:
        raise ValueError("Unreadable image file")
    orig_w, orig_h = rgb.size

    cropped, yolo_box = _crop_to_panel(rgb)
    cropped, skin_box = _skin_margin_crop(cropped)
    gray = _upscale(_enhance(cropped.convert("L")))
    # Extra voting variants for the OCR engine (cheap, in-memory only).
    # Grayscale base is shared so large phone photos are enhanced once.
    try:
        gray_base = gray
        contrast_img = _contrast_boost(gray_base)
        thresh_img = _threshold(_enhance(cropped.convert("L")))
        thresh_img = _upscale(thresh_img)
    except Exception:
        contrast_img, thresh_img = gray, gray

    arr = np.asarray(gray, dtype=np.uint8)
    rel = os.path.join("processed", f"{image_id}_yolo.png")
    gray.save(os.path.join(STORAGE_DIR, rel))

    return {
        "processed_path": rel.replace(os.sep, "/"),
        "processed_path_thresh": rel.replace(os.sep, "/"),
        "image": arr,
        "variants": {"clean": arr,
                     "contrast": np.asarray(contrast_img, dtype=np.uint8),
                     "thresh": np.asarray(thresh_img, dtype=np.uint8)},
        "meta": {
            "original_width": int(orig_w), "original_height": int(orig_h),
            "engine": "yolo-crop-pil",
            "yolo_box": yolo_box,
            "yolo_cropped": yolo_box is not None,
            "skin_box": skin_box,
            "skin_cropped": skin_box is not None,
            "steps": ["exif-upright", "yolo-panel-crop", "skin-margin-crop",
                      "grayscale", "autocontrast", "lanczos-resize",
                      "contrast-boost-copy", "threshold-copy"],
            "variants": ["clean", "contrast", "thresh"],
        },
    }
