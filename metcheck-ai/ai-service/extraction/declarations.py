"""Declaration extraction: OCR text -> structured fields with confidence.

Every field is {value, confidence, status} where status is FOUND or NOT_FOUND.
If a field cannot be detected it is returned as null / 0 / NOT_FOUND —
information is never invented.

Tolerant to real-world OCR noise: letter spacing ("M R P"), dotted forms
("M.R.P."), common misreads ("MRF"/"NRP" for MRP, "Ner"/"Nct" for Net),
missing currency symbols, and extra punctuation.
"""
import re
from typing import Dict, Any, Optional

# ---------------------------------------------------------------------------
# Normalisation: fix systematic OCR damage before matching, but keep the
# ORIGINAL text for the returned values.
# ---------------------------------------------------------------------------

_LIGATURES = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"}


def _normalize_for_match(text: str) -> str:
    t = text or ""
    for k, v in _LIGATURES.items():
        t = t.replace(k, v)
    # Tesseract often renders ₹ as ?, Rs. as R5/Rs, "/" as "?" etc. — keep both.
    t = t.replace("`", "'").replace("´", "'")
    # collapse runs of spaces/tabs but keep newlines (extraction is line-based)
    t = re.sub(r"[ \t\u00a0]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    return t


def _found(value: Optional[str], confidence: float, ocr_conf: float) -> Dict[str, Any]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return {"value": None, "confidence": 0, "status": "NOT_FOUND"}
    if isinstance(value, list):
        if not value:
            return {"value": None, "confidence": 0, "status": "NOT_FOUND"}
        return {"value": value, "confidence": round(min(0.99, confidence * ocr_conf), 2), "status": "FOUND"}
    return {"value": value.strip(), "confidence": round(min(0.99, confidence * ocr_conf), 2), "status": "FOUND"}


def _missing() -> Dict[str, Any]:
    return {"value": None, "confidence": 0, "status": "NOT_FOUND"}


def _clean_capture(s: str, limit: int = 120) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    s = s.strip(" :-–—|")
    return s[:limit].strip()


# --- OCR-tolerant label fragments ------------------------------------------------
# "M R P" / "M.R.P." / "M-R-P" all match; common single-char misreads included.
MRP_LABEL = r"(?:M\s*[\.\-_]?\s*R\s*[\.\-_]?\s*P|Maximum\s+Retail\s+Price|Max\s*\.?\s*Retail\s+Price|Retail\s+Price)"
MRP_LABEL_FUZZY = r"(?:[MHNW]\s*[\.\-_]?\s*[RX]\s*[\.\-_]?\s*[PF])"  # MRF/NRP/HRP/WRP... low-conf fallback
NET_LABEL = r"(?:N\s*[eao]\s*t|N\s*e\s*r|N\s*c\s*t|M\s*e\s*t\b|Net|Ner|Nct)"
QTY_WORD = r"(?:Qty|Quty|Qly|Qnt|Oty|Oly|Quantity|Qauantity|Wt|Weight|Content)"
UNIT = r"(?:kgs?|grams?|gms?|g\b|ml|ltr\.?|ltrs?|litres?|liters?|l\b|mg|kg|cm|m\b|pcs|pieces?|packets?|pouches?|nos?\.?|tablets?|capsules?|bars?)"
MFG_LABEL = r"(?:M\s*f\s*g|M\s*f\s*d|Mfg\.?|Mfd\.?|MFG|MFD|Manufactured)"
PKD_LABEL = r"(?:P\s*k\s*d|Pkd\.?|Packed|Packer|Packing|Pack\s*(?:date|on)?)"
IMP_LABEL = r"(?:Imported?|Importer)"
MKT_LABEL = r"(?:Marketed|Mktd?\.?(?:\s*by)?|Mkt\s+by)"
DATE = r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\s\-\.]+\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|\b(?:0?[1-9]|1[0-2])[\/\-\.]\d{4}\b)"
PRICE = r"((?:Rs\.?|₹|INR|RS\.?)?\s*\d[\d,\s]*\.?\d*\s*(?:\/\s*-|/-)?\s*(?:Rs\.?|₹|INR)?(?:\s*inclusive\s+of\s+all\s+taxes)?)"

_LABEL_LINE_RE = re.compile(
    r"MRP|M\.?\s*R\.?\s*P|Maximum\s+Retail|Net\s*(Qty|Quantity|Quty|Wt)|"
    r"Mfg|Mfd|Manufactured|Pkd|Packed|Exp|Best\s*before|Use\s*by|Consumer|Customer|"
    r"Helpline|Toll|Imported|Marketed|Country\s*of|Made\s*in|FSSAI",
    re.I)


def extract_declarations(text: str, ocr_confidence: float = 1.0) -> Dict[str, Any]:
    raw = text or ""
    t = _normalize_for_match(raw)
    oc = max(0.0, min(1.0, ocr_confidence if ocr_confidence else 1.0))
    out: Dict[str, Any] = {}

    # ---- productName: first meaningful non-label line -------------------------
    pname, pconf = None, 0.6
    for ln in [ln.strip() for ln in t.splitlines() if ln.strip()][:8]:
        if _LABEL_LINE_RE.search(ln):
            continue
        if len(re.sub(r"[^A-Za-z]", "", ln)) >= 3:
            pname = ln[:100]
            break
    if pname is None:  # fallback: longest alpha line anywhere
        best = ""
        for ln in [ln.strip() for ln in t.splitlines() if ln.strip()]:
            if _LABEL_LINE_RE.search(ln):
                continue
            if len(ln) > len(best) and len(re.sub(r"[^A-Za-z]", "", ln)) >= 3:
                best = ln
        pname = best[:100] if best else None
    out["productName"] = _found(pname, pconf, oc)

    # ---- manufacturer / packer / importer -------------------------------------
    m = re.search(r"Manufactured\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})", t, re.I)
    out["manufacturer"] = _found(_clean_capture(m.group(1)) if m else None, 0.9, oc)
    m = re.search(MFG_LABEL + r"\s*(?:by|date|on)?\s*[:\-]?\s*([A-Z][^\n,]{2,100})", t)
    if out["manufacturer"]["status"] == "NOT_FOUND" and m:
        cand = _clean_capture(m.group(1))
        # avoid grabbing a bare date OR a date-label line ("MFD - USE BY ...")
        if not re.match(r"^[\d\/\-. ]+$", cand) and not re.search(
                r"USE\s*BY|USEBY|EXPIR|BEST\s*BEFORE|LOT\s*NO|DATE\s*OF\s*(?:MFG|MFD|PKD)", cand, re.I):
            out["manufacturer"] = _found(cand, 0.75, oc)
    m = re.search(PKD_LABEL + r"\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})", t, re.I)
    if m:
        cand = _clean_capture(m.group(1))
        out["packer"] = _found(None if re.match(r"^[\d\/\-. ]+$", cand) else cand, 0.9, oc)
    else:
        out["packer"] = _missing()
    m = re.search(IMP_LABEL + r"\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})", t, re.I)
    if m:
        cand = _clean_capture(m.group(1))
        out["importer"] = _found(None if re.match(r"^[\d\/\-. ]+$", cand) else cand, 0.9, oc)
    else:
        out["importer"] = _missing()
    if out["manufacturer"]["status"] == "NOT_FOUND":
        m = re.search(MKT_LABEL + r"\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})", t, re.I)
        if m:
            out["manufacturer"] = _found(_clean_capture(m.group(1)), 0.8, oc)

    # ---- net quantity -----------------------------------------------------------
    m = re.search(NET_LABEL + r"\s*" + QTY_WORD + r"?\s*[\.\:\-]?\s*(\d+\.?\d*\s*(?:x\s*\d+\.?\d*\s*)?" + UNIT + r")", t, re.I)
    if m:
        out["netQuantity"] = _found(_clean_capture(m.group(1), 40), 0.95, oc)
    else:
        m = re.search(r"(\d+\.?\d*\s*(?:x\s*\d+\.?\d*\s*)?" + UNIT + r")", t, re.I)
        out["netQuantity"] = _found(_clean_capture(m.group(1), 40) if m else None, 0.8, oc)

    # ---- MRP ----------------------------------------------------------------------
    m = re.search(MRP_LABEL + r"\s*\.?\s*(?:is|:| RS| Rs)?\s*[:\-]?\s*" + PRICE, t, re.I)
    if m:
        raw_price = _clean_capture(m.group(1), 60)
        digit_ok = bool(re.search(r"\d", raw_price))
        if not digit_ok:
            out["mrp"] = _missing()
        else:
            has_currency = bool(re.search(r"Rs|₹|INR", raw_price, re.I))
            out["mrp"] = _found(raw_price, 0.98 if has_currency else 0.9, oc)
    else:
        m = re.search(MRP_LABEL_FUZZY + r"\s*[:\-]?\s*" + PRICE, t, re.I)
        if m and re.search(r"\d", m.group(1)):
            out["mrp"] = _found(_clean_capture(m.group(1), 60), 0.7, oc)
        else:
            # last resort: "Rs. 299" / "₹299" price line
            m = re.search(r"\b(?:Rs\.?|₹|INR)\s*\d[\d,\s]*\.?\d*", t, re.I)
            out["mrp"] = _found(_clean_capture(m.group(0), 60) if m else None, 0.65, oc) if m else _missing()

    # ---- dates -----------------------------------------------------------------------
    m = re.search(r"(?:" + MFG_LABEL + r"|Manufactured)(?:\s*(?:date|on|by))?\s*[:\-]?\s*" + DATE, t, re.I)
    out["manufacturingDate"] = _found(m.group(1).strip() if m else None, 0.9, oc)
    m = re.search(r"(?:" + PKD_LABEL + r"|Pack(?:ed|aging)?\s*(?:date|on)?)\s*[:\-]?\s*" + DATE, t, re.I)
    if m and not re.search(r"(?:manufact|mfg|mfd)", m.group(0), re.I):
        out["packingDate"] = _found(m.group(1).strip(), 0.9, oc)
    else:
        # avoid double-counting the Mfg line as Pkd
        m2 = re.search(r"\bPkd\b[^:\n]*[:\-][^\n]*?" + DATE, t, re.I)
        out["packingDate"] = _found(m2.group(1).strip() if m2 else None, 0.9, oc)
    m = re.search(r"(?:Imported?\s*(?:on|date)?)\s*[:\-]?\s*" + DATE, t, re.I)
    out["importDate"] = _found(m.group(1).strip() if m else None, 0.9, oc)

    # ---- consumer care ------------------------------------------------------------------
    m = re.search(
        r"(Consumer\s*care[^\n]{0,10}[:\-][^\n]{2,140}|Customer\s*care[^\n]{0,10}[:\-][^\n]{2,140}|"
        r"Consumer\s*care[^\n]{2,140}|Customer\s*care[^\n]{2,140}|"
        r"Helpline[^\n]{0,20}[:\-]?[^\n]{1,60}|Help\s*line[^\n]{0,20}[:\-]?[^\n]{1,60}|"
        r"Toll[\s\-]*free[^\n]{1,60}|1800[\s\-]?\d[\d\s\-]{5,}|care@[^\s,;]+|support@[^\s,;]+|"
        r"customercare@[^\s,;]+|info@[^\s,;]+|\b[6-9]\d{9}\b)", t, re.I)
    out["consumerCare"] = _found(_clean_capture(m.group(0), 160) if m else None, 0.9, oc)

    # ---- address: PIN code line wins, else keyword line -----------------------------------
    addr, aconf = None, 0.8
    pin_line = None
    for ln in [ln.strip() for ln in t.splitlines() if ln.strip()]:
        if re.search(r"\b[1-9]\d{5}\b", ln):
            pin_line = ln[:180]
            break
    if pin_line:
        addr, aconf = pin_line, 0.9
    else:
        m = re.search(r"([^\n]{5,100}(?:Street|Road|Rood|Nagar|Industrial|Plot|Gujarat|Maharashtra|Delhi|Mumbai|Pune|Chennai|Kolkata|Bengaluru|Bangalore|Hyderabad|Anand|India|Park|Area|Phase|Limited|Ltd|Pvt)[^\n]{0,80})", t, re.I)
        if m:
            addr = _clean_capture(m.group(1), 180)
    out["address"] = _found(addr, aconf, oc)

    # ---- expiry ------------------------------------------------------------------------------
    m = re.search(r"(?:Exp(?:iry|iry)?(?:\s*date)?|Best\s*before|Use\s*by|Best Before)\s*[:\-]?\s*([^\n]{1,60})", t, re.I)
    out["expiry"] = _found(_clean_capture(m.group(1), 80) if m else None, 0.85, oc)

    # ---- country of origin ----------------------------------------------------------------------
    m = re.search(r"(?:Country\s*of\s*(?:origin)?|Made\s*in|Origin|Product\s*of)\s*:?\s*([A-Za-z ]{2,40})", t, re.I)
    out["countryOrigin"] = _found(_clean_capture(m.group(1), 40) if m else None, 0.9, oc)

    # ---- other declarations ------------------------------------------------------------------------
    others = []
    for pat in [r"(Country\s*of\s*(?:origin)?\s*:?\s*[A-Za-z ]{2,40})",
                r"(FSSAI[^\n]{1,40})",
                r"(Lic\.?\s*No\.?[^\n]{1,30})",
                r"(Batch\s*(?:No\.?|Number)?\s*[:\-]?[^\n]{1,30})",
                r"(Lot\s*(?:No\.?|Number)?\s*[:\-]?[^\n]{1,30})",
                r"((?:www\.|https?://)[^\s,;]+)",
                r"((?:customercare|support|info|care)@[^\s,;]+)"]:
        for mm in re.finditer(pat, t, re.I):
            v = _clean_capture(mm.group(1), 120)
            if v and v not in others:
                others.append(v)
    out["otherDeclarations"] = _found(others, 0.8, oc) if others else _missing()

    return out
