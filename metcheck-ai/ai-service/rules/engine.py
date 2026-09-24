"""Configurable rule engine over the MongoDB rule collection.

Input: extracted declarations + product category + active rules.
Output: {checks, passed, failed, manualReview, score, status, scoreDetail}.

Statuses: COMPLIANT | POTENTIAL_VIOLATION | MANUAL_REVIEW | UNABLE_TO_VERIFY.
The engine reports screening outcomes only — never a legally binding violation.
"""
import json
import os
from typing import List, Dict, Any

RULES_FILE = os.path.join(os.path.dirname(__file__), "default_rules.json")

# Detections below this confidence are too uncertain to pass automatically.
CONFIDENCE_THRESHOLD = 0.5

STATUSES = ("COMPLIANT", "POTENTIAL_VIOLATION", "MANUAL_REVIEW", "UNABLE_TO_VERIFY")


def load_rules(path: str = RULES_FILE) -> List[Dict]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _lower_list(v) -> List[str]:
    return [str(x).lower() for x in (v or [])]


PRODUCT_CATEGORY_IDS = ["general", "food", "beverages", "cosmetics",
                        "pharmaceuticals", "household", "electrical"]


def normalize_rule(r: Dict[str, Any]) -> Dict[str, Any]:
    """Accept the canonical schema, verified source records and legacy keys."""
    validation_type = str(r.get("validationType") or ("REQUIRED" if r.get("required") else "OPTIONAL")).upper()
    category = str(r.get("category") or "GENERAL")
    applies_to = _lower_list(r.get("appliesTo") or r.get("applicableTo"))
    if applies_to:
        scope = applies_to[0].upper() if len(applies_to) == 1 else "MULTI"
    elif category.lower() in PRODUCT_CATEGORY_IDS:
        scope = category.upper()
    else:
        scope = "GENERAL"
    status_active = (not r.get("status")) or str(r.get("status")).lower() == "active"
    source_bits = [b for b in [r.get("sourceDocument"),
                               f"p.{r.get('sourcePage')}" if r.get("sourcePage") not in (None, "") else None] if b]
    return {
        "ruleId": r.get("ruleId") or r.get("id"),
        "name": r.get("name") or r.get("label") or r.get("ruleId") or r.get("id"),
        "field": r.get("field"),
        "anyOf": r.get("anyOf") or [],
        "description": r.get("description") or r.get("requirement") or "",
        "requirement": r.get("requirement"),
        "category": category,
        "scope": scope,
        "appliesTo": applies_to,
        "validationType": validation_type,
        "requiredFor": _lower_list(r.get("requiredFor")),
        "severity": str(r.get("severity") or "MEDIUM").upper(),
        "active": (r.get("active", True) is not False) and status_active,
        "source": r.get("source") or (", ".join(source_bits) if source_bits else "Legal Metrology reference material"),
        "sourceDocument": r.get("sourceDocument"),
        "sourcePage": r.get("sourcePage"),
        "status": r.get("status") or ("inactive" if r.get("active") is False else "active"),
    }


def _lookup(fields: Dict[str, Any], rule: Dict[str, Any]):
    """Return the best matching declaration for a rule (field or anyOf). Supports legacy {present,value}."""
    cands = []
    keys = ([rule["field"]] if rule.get("field") else []) + list(rule.get("anyOf") or [])
    for k in keys:
        f = (fields or {}).get(k)
        if isinstance(f, dict):
            cands.append((k, f))
    if not cands:
        return None, {"value": None, "confidence": 0, "status": "NOT_FOUND"}
    def rank(item):
        k, f = item
        st = f.get("status")
        present = (st == "FOUND") if st else bool(f.get("present"))
        return (1 if present else 0, float(f.get("confidence") or 0))
    return max(cands, key=rank)


def evaluate(fields: Dict[str, Any], rules: List[Dict], category: str = "general") -> Dict[str, Any]:
    cat = (category or "general").lower()
    checks, passed, failed, manual = [], [], [], []
    for raw in rules or []:
        r = normalize_rule(raw)
        if not r["active"]:
            continue
        if r["scope"] not in ("GENERAL", "MULTI") and r["scope"].lower() != cat:
            continue
        if r["scope"] == "MULTI" and cat not in r["appliesTo"]:
            continue
        key, f = _lookup(fields, r)
        st = f.get("status")
        found = (st == "FOUND") if st else bool(f.get("present"))
        conf = float(f.get("confidence") or (0.9 if found else 0))
        required = r["validationType"] == "REQUIRED" or cat in r["requiredFor"]
        if required and found and conf < CONFIDENCE_THRESHOLD:
            status, ok, note = "review", False, "low_confidence"
        elif not required:
            status, ok, note = ("pass", True, None) if found else ("review", True, None)
        elif found:
            status, ok, note = "pass", True, None
        else:
            status, ok, note = "fail", False, None
        check = {"ruleId": r["ruleId"], "name": r["name"], "field": key or r["field"],
                 "required": required, "severity": r["severity"], "passed": ok,
                 "status": status, "value": f.get("value"), "confidence": conf,
                 "description": r["description"], "source": r["source"]}
        if note:
            check["note"] = note
        checks.append(check)
        if status == "pass":
            passed.append(r["ruleId"])
        elif status == "fail":
            failed.append(r["ruleId"])
        else:
            manual.append(r["ruleId"])

    applicable = len([c for c in checks if c["required"]])
    req_pass = len([c for c in checks if c["required"] and c["status"] == "pass"])
    score = round(100 * req_pass / applicable) if applicable else 0
    has_fields = bool(fields) and any(
        ((v.get("status") == "FOUND") if isinstance(v, dict) and v.get("status") else bool(isinstance(v, dict) and v.get("present")))
        for v in fields.values()
    )
    if not has_fields:
        status = "UNABLE_TO_VERIFY"
    elif failed:
        status = "POTENTIAL_VIOLATION"
    elif score == 100 and not manual:
        status = "COMPLIANT"
    elif manual or score >= 70:
        status = "MANUAL_REVIEW"
    else:
        status = "UNABLE_TO_VERIFY"
    return {"checks": checks, "passed": passed, "failed": failed, "manualReview": manual,
            "score": score, "status": status,
            "scoreDetail": {"applicable": applicable, "passed": req_pass, "failed": len(failed)},
            "missing": [c["name"] for c in checks if c["status"] == "fail"]}
