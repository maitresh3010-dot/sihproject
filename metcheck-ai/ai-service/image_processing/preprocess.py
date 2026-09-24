"""Image preprocessing for OCR: grayscale, upscale, denoise, threshold."""
from PIL import Image, ImageOps
import io

def preprocess(image_bytes: bytes, max_side: int = 2000) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    # auto contrast + upscale small images
    img = ImageOps.autocontrast(img)
    w, h = img.size
    scale = 1.0
    if max(w, h) < 1200:
        scale = 1200 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img
