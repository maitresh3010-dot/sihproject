"""YOLO-based label/panel detection (replaces OpenCV filter preprocessing).

Role: find the declaration panel / package label ROI and return boxes so the
caller can crop before OCR. No cv2 dependency — works on PIL images.

Behaviour:
  * Model is lazy-loaded and cached (first call downloads yolov8n.pt once).
  * ``YOLO_ENABLED=0`` or missing ``ultralytics``/torch -> returns [] and the
    caller falls back to the full image (PIL-only path, still no OpenCV).
  * ``YOLO_MODEL`` env overrides the weights path (use a custom trained
    label-panel model when available, e.g. ``models/panel.pt``).
  * ``YOLO_CONF`` env sets the confidence threshold (default 0.25).
"""
import os

_MODEL = None
_MODEL_LOAD_FAILED = False


def _enabled() -> bool:
    return os.getenv("YOLO_ENABLED", "1").strip() not in ("0", "false", "no", "off")


def _model_name() -> str:
    return os.getenv("YOLO_MODEL", "yolov8n.pt").strip() or "yolov8n.pt"


def _conf_thresh() -> float:
    try:
        return max(0.05, min(0.9, float(os.getenv("YOLO_CONF", "0.25"))))
    except ValueError:
        return 0.25


def _get_model():
    """Lazy-load the Ultralytics YOLO model (cached). None when disabled."""
    global _MODEL, _MODEL_LOAD_FAILED
    if not _enabled() or _MODEL_LOAD_FAILED:
        return None
    if _MODEL is not None:
        return _MODEL
    try:
        from ultralytics import YOLO
    except Exception:
        _MODEL_LOAD_FAILED = True
        return None
    try:
        _MODEL = YOLO(_model_name())
        return _MODEL
    except Exception:
        _MODEL_LOAD_FAILED = True
        return None


def detect_boxes(pil_rgb):
    """Run YOLO on a PIL RGB image.

    Returns a list of ``{x, y, w, h, conf, cls}`` in original-image pixels,
    sorted by area (largest first). Empty list when YOLO is disabled or
    nothing is detected — caller must use the full image then.
    """
    model = _get_model()
    if model is None or pil_rgb is None:
        return []
    try:
        w, h = pil_rgb.size
        # Downscale huge phone photos for detection speed; rescale boxes back.
        max_side = 1280
        scale = 1.0
        img = pil_rgb
        if max(w, h) > max_side:
            scale = max_side / max(w, h)
            img = pil_rgb.resize((max(1, int(w * scale)), max(1, int(h * scale))))
        results = model.predict(img, conf=_conf_thresh(), verbose=False)
        boxes = []
        for r in results:
            if getattr(r, "boxes", None) is None:
                continue
            for b in r.boxes:
                try:
                    xyxy = b.xyxy[0].tolist()
                    conf = float(b.conf[0]) if b.conf is not None else 0.0
                    cls = int(b.cls[0]) if b.cls is not None else -1
                except Exception:
                    continue
                x1, y1, x2, y2 = xyxy
                # Map back to original resolution.
                if scale != 1.0:
                    x1, y1, x2, y2 = (v / scale for v in (x1, y1, x2, y2))
                x1 = max(0, min(w - 1, int(x1)))
                y1 = max(0, min(h - 1, int(y1)))
                x2 = max(x1 + 1, min(w, int(x2)))
                y2 = max(y1 + 1, min(h, int(y2)))
                boxes.append({"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1,
                              "conf": round(conf, 3), "cls": cls})
        boxes.sort(key=lambda b: b["w"] * b["h"], reverse=True)
        return boxes
    except Exception:
        return []
