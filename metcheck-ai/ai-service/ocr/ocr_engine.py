"""OCR engine: Tesseract word data -> text, mean confidence, blocks.

Robustness strategy (cheap, no new heavy deps):
  * OSD orientation check FIRST — sideways phone photos otherwise produce
    fragment garbage ("Bai", "oma", "ph") that can outscore the real read.
  * Try several page-segmentation modes (PSM 6/4/3/11) — package labels
    are sparse blocks, not book pages; a single default PSM misses a lot.
  * Try preprocessing variants (clean grayscale + thresholded) plus an
    inverted copy (white-on-dark packaging fails without it) and keep the
    best-scoring result.
  * Score penalises gibberish: high-confidence fragments of 1-2 chars must
    not beat a slightly noisier real label read.

Result includes ``legible`` (False when the text looks like fragments) so
callers can ask the user to retake the photo instead of reporting garbage.
"""
import os
import re
import shutil
from typing import Dict, List

try:
    import pytesseract
    from pytesseract import Output
    # Resolve the Tesseract binary: explicit env override, PATH, then
    # well-known Windows install locations (the installer may skip PATH).
    _CANDIDATES = [
        os.environ.get("TESSERACT_CMD"),
        shutil.which("tesseract"),
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    _BIN = next((c for c in _CANDIDATES if c and os.path.exists(c)), None)
    if _BIN:
        pytesseract.pytesseract.tesseract_cmd = _BIN
    _HAS_TESS = _BIN is not None
except Exception:
    _HAS_TESS = False


# PSM modes worth trying on packaging, in order of preference.
# PSM 11 (sparse text) is excluded: slow and turns background noise into
# confident 2-letter "words", so it almost never wins the vote.
_PSMS = (6, 4, 3)
# Small prior so PSM 6 wins ties over sparse-text PSM 11 (which loves
# turning background noise into confident 2-letter "words").
_PSM_PRIOR = {6: 0.03, 4: 0.02, 3: 0.01, 11: 0.0}
_OEM = 1  # LSTM only — best accuracy on modern Tesseract

# Hung Tesseract calls must never stall a scan forever: every pytesseract
# invocation runs through a helper thread with a hard timeout.
_CALL_TIMEOUT = 20  # seconds per Tesseract call
_OCR_DEADLINE = 55  # seconds total for the whole OCR attempt
_OCR_MAX_SIDE = 1800  # downscale working copies above this (phone photos);
# Tesseract gains nothing from 3000px inputs, it just gets 3-4x slower.


def _call_with_timeout(fn, *args, **kwargs):
    """Run a blocking Tesseract call with a hard timeout. Returns ""/raises
    TimeoutError instead of hanging the scan forever."""
    import concurrent.futures as _cf
    with _cf.ThreadPoolExecutor(max_workers=1) as _ex:
        fut = _ex.submit(fn, *args, **kwargs)
        return fut.result(timeout=_CALL_TIMEOUT)


def _shrink_for_ocr(pil_image):
    """Downscale oversized working copies for OCR speed (stored/preprocessed
    files are untouched — this only affects what Tesseract sees)."""
    try:
        w, h = pil_image.size
        long_side = max(w, h)
        if long_side > _OCR_MAX_SIDE:
            s = _OCR_MAX_SIDE / long_side
            return pil_image.resize((max(1, int(w * s)), max(1, int(h * s))))
    except Exception:
        pass
    return pil_image


def _union(boxes):
    xs = [b["x"] for b in boxes]; ys = [b["y"] for b in boxes]
    xe = [b["x"] + b["w"] for b in boxes]; ye = [b["y"] + b["h"] for b in boxes]
    return {"x": min(xs), "y": min(ys), "w": max(xe) - min(xs), "h": max(ye) - min(ys)}


def _clean_text(text: str) -> str:
    if not text:
        return ""
    # normalize line endings, collapse trailing spaces, drop empty lines
    # at the edges but keep internal structure (extraction uses lines)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    # drop leading/trailing blank lines
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _legibility(words: List[Dict], text: str) -> Dict:
    """Heuristics separating real label reads from fragment garbage.

    Garbage typical of sideways/blurry photos: a handful of 1-3 char
    fragments ("Bai", "oma", "ph"), almost no digits, almost no words
    of length >= 4 that labels always have (product names, "Manufactured",
    "Quantity", "Consumer"...).
    """
    toks = [w.get("text", "") for w in (words or [])]
    toks = [t for t in toks if t]
    n = len(toks)
    if not n or not (text or "").strip():
        return {"legible": False, "reason": "empty", "long_words": 0, "total": 0}
    alnum = [t for t in toks if re.search(r"[A-Za-z0-9]", t)]
    long_words = sum(1 for t in alnum if len(re.sub(r"[^A-Za-z]", "", t)) >= 4)
    has_digit = any(re.search(r"\d", t) for t in toks)
    chars = len(text.strip())
    # A real declaration panel almost always has several solid words.
    if chars >= 30 and (long_words >= 3 or (long_words >= 2 and has_digit)):
        return {"legible": True, "reason": "ok", "long_words": long_words, "total": n}
    if chars >= 60 and long_words >= 2:
        return {"legible": True, "reason": "ok-long", "long_words": long_words, "total": n}
    return {"legible": False, "reason": "fragments", "long_words": long_words, "total": n}


def _score(words: List[Dict], text: str, psm: int) -> float:
    """Higher is better. Confidence + text amount, minus gibberish penalty."""
    if not words or not text.strip():
        return -1.0
    confs = [w.get("conf", 0) for w in words]
    mean = sum(confs) / len(confs) if confs else 0  # 0-100 scale
    # length factor saturates ~200 chars so long labels don't dominate
    length_factor = min(1.0, len(text.strip()) / 200.0)
    base = (mean / 100.0) * (0.4 + 0.6 * length_factor)
    leg = _legibility(words, text)
    if not leg["legible"]:
        base *= 0.5  # fragments must not beat a real read
    return base + _PSM_PRIOR.get(psm, 0.0)


def _config(psm: int) -> str:
    return f"--oem {_OEM} --psm {psm} -l eng"


def _run_text_only(pil_image, psm: int) -> str:
    """Fast pass: text only (no word boxes). Used to shortlist candidates."""
    try:
        return _clean_text(_call_with_timeout(
            pytesseract.image_to_string, pil_image, config=_config(psm)) or "")
    except Exception:
        return ""


def _text_score(text: str, psm: int) -> float:
    """Score text without confidences (Phase 1 shortlist)."""
    if not text.strip():
        return -1.0
    fake_words = [{"text": t} for t in re.findall(r"\S+", text)]
    leg = _legibility(fake_words, text)
    length_factor = min(1.0, len(text.strip()) / 200.0)
    base = 0.4 + 0.6 * length_factor
    if not leg["legible"]:
        base *= 0.5
    return base + _PSM_PRIOR.get(psm, 0.0)


def _run_data_only(pil_image, psm: int) -> Dict:
    """Word boxes + confidence for the winning candidate (single pass)."""
    data = _call_with_timeout(
        pytesseract.image_to_data, pil_image, config=_config(psm), output_type=Output.DICT)
    words, blocks_map = [], {}
    n = len(data.get("text", []))
    for i in range(n):
        t = (data["text"][i] or "").strip()
        if not t:
            continue
        try:
            conf = float(data["conf"][i])
        except Exception:
            conf = -1
        if conf < 0:
            continue
        box = {"x": int(data["left"][i]), "y": int(data["top"][i]),
               "w": int(data["width"][i]), "h": int(data["height"][i])}
        w = {"text": t, "conf": round(conf, 1), "box": box,
             "block": int(data.get("block_num", [0])[i])}
        words.append(w)
        blocks_map.setdefault(w["block"], []).append(w)
    blocks = []
    for bid, ws in blocks_map.items():
        confs = [x["conf"] for x in ws]
        blocks.append({
            "id": int(bid),
            "text": " ".join(x["text"] for x in ws),
            "confidence": round(sum(confs) / len(confs) / 100, 3),
            "box": _union([x["box"] for x in ws]),
        })
    confs = [w["conf"] for w in words]
    confidence = round(sum(confs) / len(confs) / 100, 3) if confs else 0
    return {"confidence": confidence, "words": words, "blocks": blocks}


def _run_once(pil_image, psm: int) -> Dict:
    config = _config(psm)
    text = _call_with_timeout(pytesseract.image_to_string, pil_image, config=config) or ""
    data = _call_with_timeout(pytesseract.image_to_data, pil_image, config=config, output_type=Output.DICT)
    words, blocks_map = [], {}
    n = len(data.get("text", []))
    for i in range(n):
        t = (data["text"][i] or "").strip()
        if not t:
            continue
        try:
            conf = float(data["conf"][i])
        except Exception:
            conf = -1
        if conf < 0:
            continue
        box = {"x": int(data["left"][i]), "y": int(data["top"][i]),
               "w": int(data["width"][i]), "h": int(data["height"][i])}
        w = {"text": t, "conf": round(conf, 1), "box": box,
             "block": int(data.get("block_num", [0])[i])}
        words.append(w)
        blocks_map.setdefault(w["block"], []).append(w)
    blocks = []
    for bid, ws in blocks_map.items():
        confs = [x["conf"] for x in ws]
        blocks.append({
            "id": int(bid),
            "text": " ".join(x["text"] for x in ws),
            "confidence": round(sum(confs) / len(confs) / 100, 3),
            "box": _union([x["box"] for x in ws]),
        })
    confs = [w["conf"] for w in words]
    confidence = round(sum(confs) / len(confs) / 100, 3) if confs else 0
    cleaned = _clean_text(text)
    leg = _legibility(words, cleaned)
    return {"text": cleaned, "confidence": confidence,
            "words": words, "blocks": blocks, "psm": psm,
            "legible": leg["legible"]}


def _osd_angle(pil_image) -> int:
    """Orientation in degrees reported by Tesseract OSD (0 when unknown)."""
    try:
        osd = pytesseract.image_to_osd(pil_image)
        m = re.search(r"Orientation in degrees:\s*(\d+)", osd or "")
        return int(m.group(1)) if m else 0
    except Exception:
        return 0


def _maybe_invert(pil_image):
    """White-on-dark packaging: also try the photographic negative."""
    try:
        from PIL import ImageOps
        img = pil_image.convert("L") if pil_image.mode != "L" else pil_image
        return ImageOps.invert(img)
    except Exception:
        return None


def run_ocr_detailed(pil_image, variants: Dict = None) -> Dict:
    """Return {text, confidence (0-1), words, blocks, engine, legible}.

    Two-phase for speed: Phase 1 shortlists candidates with text-only passes
    (1 Tesseract call each); Phase 2 runs word-data ONCE on the winner.
    A good photo costs ~3 passes total instead of 8+.

    ``pil_image`` is the primary input (backward compatible). ``variants``
    optionally maps name -> PIL image for extra preprocessing copies.
    """
    if not _HAS_TESS:
        return {"text": "", "confidence": 0, "words": [], "blocks": [],
                "engine": "unavailable", "legible": False,
                "hint": "Tesseract binary not found. Install Tesseract 5.x "
                        "(Windows: winget install UB-Mannheim.TesseractOCR, "
                        "Linux: apt install tesseract-ocr) and restart the service."}
    try:
        import time as _time
        from concurrent.futures import ThreadPoolExecutor

        _start = _time.monotonic()

        def _expired():
            return (_time.monotonic() - _start) > _OCR_DEADLINE

        candidates = {"clean": pil_image}
        # Inverted copy early: white-on-dark labels fail on every other
        # variant, so try it before the thresholded copy.
        inv = _maybe_invert(pil_image)
        if inv is not None:
            candidates["inv-clean"] = inv
        if isinstance(variants, dict):
            for k, v in variants.items():
                if v is not None and k not in candidates:
                    candidates[k] = v
        # Cap working size for OCR speed: 3000px phone photos gain Tesseract
        # nothing over ~1800px, they just make every pass 3-4x slower and
        # stall the scan at "Text detected". Stored/processed files keep
        # full resolution — only what Tesseract sees is shrunk.
        # Deliberately no OSD pass either: it costs 0.2–2s on EVERY scan,
        # while the confidence-gated rotation check below recovers sideways
        # photos without it.
        W = {k: _shrink_for_ocr(v) for k, v in candidates.items()}

        tried = []
        winner = None  # (variant_name, working_image, psm, text, score)

        def _note(vname, img, psm, text):
            nonlocal winner
            s = _text_score(text, psm)
            leg = _legibility([{"text": t} for t in re.findall(r"\S+", text)], text)
            tried.append({"variant": vname, "psm": psm,
                          "chars": len(text), "legible": leg["legible"],
                          "score": round(s, 3)})
            if winner is None or s > winner[4]:
                winner = (vname, img, psm, text, s)
            return text

        def _strong():
            if winner is None or len(winner[3]) < 60 or winner[4] <= 0.85:
                return False
            toks = [{"text": t} for t in re.findall(r"\S+", winner[3])]
            return _legibility(toks, winner[3])["legible"]

        def _run_tier(combos):
            def _try_combo(c):
                vname, img, psm = c
                return (vname, img, psm, _run_text_only(img, psm))

            with ThreadPoolExecutor(max_workers=min(4, len(combos))) as ex:
                for vname, img, psm, text in ex.map(_try_combo, combos):
                    _note(vname, img, psm, text)

        # Phase 1a — fast path: clean/PSM 6 decides most photos alone.
        _note("clean", W["clean"], 6, _run_text_only(W["clean"], 6))
        if not _strong() and not _expired():
            # Phase 1b — most-likely alternatives in parallel.
            tier2 = [(n, W[n], p) for (n, p) in
                     (("clean", 4), ("inv-clean", 6), ("thresh", 6)) if n in W]
            _run_tier(tier2)
        if not _strong() and not _expired():
            # Phase 1c — trimmed: only untried PSMs on the two most useful
            # variants plus ONE sparse-text pass on clean. The old fan-out
            # (every PSM x every variant + PSM 11 everywhere = 12+ slow
            # calls) is what stalled scans at "Text detected".
            # Skip entirely when tier2 already found decent legible text.
            best_len = len(winner[3]) if winner else 0
            toks = [{"text": t} for t in re.findall(r"\S+", winner[3])] if winner else []
            decent = (best_len >= 30 and _legibility(toks, winner[3])["legible"]) if winner else False
            if not decent:
                done = {(t["variant"], t["psm"]) for t in tried}
                keep = {"clean", "thresh"}
                tier3 = [(n, img, p) for n, img in W.items()
                         if n in keep for p in _PSMS if (n, p) not in done]
                if ("clean", 11) not in done and "clean" in W:
                    tier3.append(("clean", W["clean"], 11))
                if tier3:
                    _run_tier(tier3)

        # Rotation check is deferred until AFTER Phase 2, because only the
        # word-confidence signal reliably separates real text from
        # confident-looking sideways fragments. (Text-only scores can't.)
        _rotation_pending = True

        if winner is None or not winner[3].strip():
            return {"text": "", "confidence": 0, "words": [], "blocks": [],
                    "engine": "tesseract-error: no result", "legible": False,
                    "tried": tried}

        # Phase 2 — word data once on the winner.
        vname, vimg, vpsm, vtext, _vscore = winner
        try:
            detail = _run_data_only(vimg, vpsm)
            words, blocks, confidence = detail["words"], detail["blocks"], detail["confidence"]
            if not words and vtext.strip():
                raise ValueError("empty word data")
        except Exception:
            full = _run_once(vimg, vpsm)  # fallback: legacy full pass
            words, blocks, confidence = full["words"], full["blocks"], full["confidence"]
            vtext = full["text"] or vtext
        final_score = _score(words, vtext, vpsm)
        leg = _legibility(words, vtext)

        # Rescue pass: Phase 1 shortlists on TEXT ONLY, so a garbled-but-long
        # read (glossy foil, small print) can win early and skip the other
        # variants/PSMs. When Phase 2 word-confidence comes back low, spend
        # the remaining budget on the untried combos and keep whatever scores
        # best with confidences included. Bounded to ~6 quick text-only
        # passes + ONE data pass — never stalls the scan.
        if not _expired() and (confidence < 0.55 or not leg["legible"]):
            done = {(t["variant"], t["psm"]) for t in tried}
            rescue_order = (("contrast", 6), ("thresh", 6), ("clean", 4),
                            ("contrast", 4), ("clean", 3), ("thresh", 4),
                            ("inv-clean", 6))
            rescue = [(n, W[n], p) for (n, p) in rescue_order
                      if n in W and (n, p) not in done][:6]
            best_rescue = None  # (img, psm, text, text_score, vname)
            if rescue:
                def _try_rescue(c):
                    vname, img, psm = c
                    text = _run_text_only(img, psm)
                    return (vname, img, psm, text, _text_score(text, psm))
                with ThreadPoolExecutor(max_workers=min(4, len(rescue))) as ex:
                    for vname, img, psm, text, s in ex.map(_try_rescue, rescue):
                        _note(vname, img, psm, text)
                        toks = [{"text": t} for t in re.findall(r"\S+", text)]
                        if (_legibility(toks, text)["legible"]
                                and (best_rescue is None or s > best_rescue[3])):
                            best_rescue = (img, psm, text, s, vname)
            if best_rescue is not None and not _expired():
                try:
                    rdetail = _run_data_only(best_rescue[0], best_rescue[1])
                    rscore = _score(rdetail["words"], best_rescue[2], best_rescue[1])
                    if rdetail["words"] and rscore > final_score:
                        vname, vpsm, vtext = best_rescue[4], best_rescue[1], best_rescue[2]
                        words, blocks, confidence = (rdetail["words"],
                                                     rdetail["blocks"],
                                                     rdetail["confidence"])
                        final_score = rscore
                        leg = _legibility(words, vtext)
                        tried.append({"variant": f"{vname}-RESCUED", "psm": vpsm,
                                      "chars": len(vtext), "legible": leg["legible"],
                                      "score": round(rscore, 3)})
                except Exception:
                    pass

        # Rotation fallback: low confidence or fragments mean the photo may be
        # sideways (OSD often misses sparse labels). Try 90/180/270 text-only,
        # verify the best with ONE data pass, keep it only if its full
        # (confidence-aware) score beats the winner. Skipped when the OCR
        # deadline is already exceeded — never stall the scan for rotation.
        if _rotation_pending and not _expired() and (confidence < 0.6 or not leg["legible"]):
            rots = []
            for rot in (90, 180, 270):
                try:
                    rots.append((rot, W["clean"].rotate(rot, expand=True)))
                except Exception:
                    continue

            def _try_rot(item):
                rot, fixed = item
                text = _run_text_only(fixed, 6)
                return (rot, fixed, text, _text_score(text, 6))

            best_rot = None
            if rots:
                with ThreadPoolExecutor(max_workers=min(3, len(rots))) as ex:
                    for rot, fixed, text, s in ex.map(_try_rot, rots):
                        rleg = _legibility([{"text": t} for t in re.findall(r"\S+", text)], text)
                        tried.append({"variant": f"rotated-{rot}", "psm": 6,
                                      "chars": len(text), "legible": rleg["legible"],
                                      "score": round(s, 3)})
                        if rleg["legible"] and (best_rot is None or s > best_rot[2]):
                            best_rot = (fixed, text, s)
            if best_rot is not None:
                try:
                    rdetail = _run_data_only(best_rot[0], 6)
                    rwords, rconf = rdetail["words"], rdetail["confidence"]
                    rscore = _score(rwords, best_rot[1], 6)
                    if rwords and rscore > final_score:
                        vname, vimg, vpsm, vtext = "rotated", best_rot[0], 6, best_rot[1]
                        words, blocks, confidence = rwords, rdetail["blocks"], rconf
                        final_score = rscore
                        leg = _legibility(words, vtext)
                        tried.append({"variant": "rotated-VERIFIED", "psm": 6,
                                      "chars": len(vtext), "legible": leg["legible"],
                                      "score": round(rscore, 3)})
                except Exception:
                    pass
        best = {"text": vtext, "confidence": confidence, "words": words,
                "blocks": blocks, "psm": vpsm, "legible": leg["legible"]}
        best["engine"] = "tesseract"
        best["ocr_variant"] = vname
        best["ocr_psm"] = vpsm
        if not leg["legible"]:
            best["warning"] = ("Text detected but unreadable (fragments only). "
                               "Retake the photo straight-on, fill the frame with the "
                               "declaration panel, hold steady and avoid glare.")
        best["tried"] = tried
        best["_final_score"] = round(final_score, 3)
        return best
    except Exception as e:
        return {"text": "", "confidence": 0, "words": [], "blocks": [],
                "engine": f"tesseract-error: {e}", "legible": False}


def run_ocr(image) -> Dict:
    """Legacy wrapper kept for compatibility."""
    d = run_ocr_detailed(image)
    return {"text": d["text"], "words": d["words"], "engine": d["engine"]}
