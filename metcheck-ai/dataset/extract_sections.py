"""Step 2 — text -> relevant sections -> rule candidates.

Usage (from metcheck-ai/):
    python dataset/extract_sections.py [--source-doc "Document name"]

Reads dataset/ocr/pages.json, splits it into sections (rule/chapter style
headings), matches sections against declaration topics, and writes
dataset/rule_candidates.json with EXACT quoted excerpts (status: pending).

Nothing here is a verified rule yet — human verification comes next
(see review_rules.py).
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))

HEADING = re.compile(
    r"^\s*((CHAPTER|PART|RULE|SECTION|SCHEDULE|APPENDIX|FORM)\b[\s\-–:A-Z0-9().]*"
    r"|Rule\s+\d+[.\-:].*"
    r"|\d{1,2}\.\s+[A-Z][A-Z \-,()]{5,80})$"
)

# topic -> (suggested ruleId, declaration field, keywords)
TOPICS = {
    "mrp": ("LM-005", "mrp", ["maximum retail price", "m.r.p", "mrp", "retail price", "inclusive of all taxes"]),
    "net_quantity": ("LM-004", "netQuantity", ["net quantity", "net weight", "net content", "standard package", "quantity", "weight", "volume", "measure"]),
    "maker": ("LM-002", None, ["manufacturer", "packer", "importer", "marketed by", "manufactured by", "packed by"]),
    "product_name": ("LM-001", "productName", ["name of the commodity", "description of the commodity", "generic name", "brand name"]),
    "address": ("LM-003", "address", ["address", "registered office", "premises"]),
    "date": ("LM-006", None, ["date of manufacture", "date of packing", "month and year", "best before", "mfg", "pkd"]),
    "consumer_care": ("LM-007", "consumerCare", ["consumer care", "customer care", "complaint", "toll free", "helpline"]),
    "expiry": ("LM-008", "expiry", ["expiry", "expiration", "use by", "best before"]),
}


def split_sections(pages):
    sections, current = [], {"heading": "Preamble", "page": 1, "lines": []}
    for p in pages:
        for line in p["text"].splitlines():
            if HEADING.match(line.strip()) and len(line.strip()) > 3:
                if any(l.strip() for l in current["lines"]):
                    sections.append({**current, "text": "\n".join(current["lines"]).strip()})
                current = {"heading": line.strip()[:120], "page": p["page"], "lines": []}
            else:
                current["lines"].append(line)
    if any(l.strip() for l in current["lines"]):
        sections.append({**current, "text": "\n".join(current["lines"]).strip()})
    return [s for s in sections if s["text"]]


def match_topics(section):
    low = section["text"].lower()
    hits = []
    for topic, (rule_id, field, keywords) in TOPICS.items():
        found = [k for k in keywords if k in low]
        if found:
            # Exact excerpt: up to 3 matched lines with one line of context.
            lines = section["text"].splitlines()
            excerpt = []
            for i, ln in enumerate(lines):
                ll = ln.lower()
                if any(k in ll for k in found) and ln.strip():
                    if i > 0 and lines[i - 1].strip():
                        excerpt.append(lines[i - 1].strip())
                    excerpt.append(ln.strip())
                    if len(excerpt) >= 6:
                        break
            excerpt = "\n".join(dict.fromkeys(excerpt))[:600]
            hits.append({"topic": topic, "ruleId": rule_id, "field": field,
                         "keywords": found, "excerpt": excerpt})
    return hits


def main():
    source_doc = "Legal Metrology (Packaged Commodities) Rules"
    for a in sys.argv[1:]:
        if a.startswith("--source-doc="):
            source_doc = a.split("=", 1)[1]
    pages_path = os.path.join(BASE, "ocr", "pages.json")
    if not os.path.exists(pages_path):
        print("Run dataset/extract_pdf.py first (missing dataset/ocr/pages.json).")
        sys.exit(1)
    with open(pages_path, encoding="utf-8") as fh:
        pages = json.load(fh)
    sections = split_sections(pages)
    candidates, n = [], 0
    for s in sections:
        for h in match_topics(s):
            n += 1
            candidates.append({
                "candidateId": f"CAND-{n:03d}",
                "ruleId": h["ruleId"],
                "topic": h["topic"],
                "field": h["field"],
                "requirement": h["excerpt"],  # EXACT source text; verified by a human next
                "matchedKeywords": h["keywords"],
                "section": s["heading"],
                "sourcePage": s["page"],
                "sourceDocument": source_doc,
                "status": "pending",
            })
    out = os.path.join(BASE, "rule_candidates.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(candidates, fh, ensure_ascii=False, indent=2)
    print(f"{len(sections)} sections, {len(candidates)} candidates -> {out}")


if __name__ == "__main__":
    main()
