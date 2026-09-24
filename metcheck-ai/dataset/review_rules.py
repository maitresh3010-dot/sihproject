"""Step 3 — HUMAN VERIFICATION of rule candidates -> structured rules.

Usage (from metcheck-ai/):
    python dataset/review_rules.py

For every pending candidate the reviewer sees the EXACT source excerpt and
chooses:
    a  approve   -> writes an active rule record into legalMetrologyRules.json
    e  edit      -> fix the requirement text first, then approve
    r  reject    -> mark rejected (never becomes a rule)
    q  quit      -> keep the rest pending

Approved records look like:
    {
      "ruleId": "LM-001",
      "category": "Declaration",
      "requirement": "EXACT TEXT FROM VERIFIED SOURCE",
      "applicableTo": [],
      "validationType": "REQUIRED",
      "sourcePage": 12,
      "sourceDocument": "Legal Metrology (Packaged Commodities) Rules",
      "status": "active"
    }

Only human-approved records land in the rules file. Nothing is auto-verified.
"""
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
CAND_PATH = os.path.join(BASE, "rule_candidates.json")
RULES_PATH = os.path.join(BASE, "legalMetrologyRules.json")

CATEGORY_BY_TOPIC = {
    "mrp": "Declaration", "net_quantity": "Declaration", "maker": "Declaration",
    "product_name": "Declaration", "address": "Declaration", "date": "Declaration",
    "consumer_care": "Declaration", "expiry": "Declaration",
}


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def review(c, rules_doc):
    print("=" * 70)
    print(f"{c['candidateId']}  suggested {c['ruleId']}  topic={c['topic']}  "
          f"section={c.get('section', '')}  p.{c['sourcePage']}")
    print("-" * 70)
    print(c["requirement"] or "(empty excerpt)")
    print("-" * 70)
    while True:
        try:
            choice = input("[a]pprove / [e]dit / [r]eject / [q]uit: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return "quit"
        if choice == "a":
            return approve(c, rules_doc, c["requirement"])
        if choice == "e":
            print("Enter corrected requirement (exact source text). Empty line to finish:")
            lines = []
            try:
                while True:
                    line = input()
                    if not line:
                        break
                    lines.append(line)
            except (EOFError, KeyboardInterrupt):
                print()
                return "quit"
            text = "\n".join(lines).strip()
            if not text:
                print("Empty — candidate left pending.")
                return "pending"
            return approve(c, rules_doc, text)
        if choice == "r":
            return "rejected"
        if choice == "q":
            return "quit"
        print("Type a, e, r or q.")


def approve(c, rules_doc, requirement):
    rules = rules_doc.get("rules", [])
    existing = next((r for r in rules if r.get("ruleId") == c["ruleId"]), None)
    record = {
        "ruleId": c["ruleId"],
        "category": CATEGORY_BY_TOPIC.get(c["topic"], "Declaration"),
        "requirement": requirement,
        "applicableTo": [],
        "validationType": "REQUIRED",
        "sourcePage": c["sourcePage"],
        "sourceDocument": c["sourceDocument"],
        "status": "active",
    }
    if existing is not None:
        # Human-verified source fields overwrite the placeholder; keep
        # engine fields (name/field/severity/...) unless the record lacks them.
        existing.update({k: v for k, v in record.items() if v not in (None, "", []) or k not in existing})
        for k in ("field", "anyOf", "name", "severity"):
            if k not in existing and k in record:
                existing[k] = record[k]
    else:
        record.update({"name": c["ruleId"], "severity": "MEDIUM", "active": True})
        rules.append(record)
        rules_doc["rules"] = rules
    return "approved"


def main():
    candidates = load_json(CAND_PATH, None)
    if candidates is None:
        print("Run dataset/extract_sections.py first (missing rule_candidates.json).")
        sys.exit(1)
    pending = [c for c in candidates if c.get("status") == "pending"]
    if not pending:
        print("No pending candidates. Nothing to verify.")
        return
    rules_doc = load_json(RULES_PATH, {"rules": []})
    done = {"approved": 0, "rejected": 0}
    for c in pending:
        outcome = review(c, rules_doc)
        if outcome == "quit":
            break
        c["status"] = "approved" if outcome == "approved" else outcome
        if outcome in done:
            done[outcome] += 1
        save_json(CAND_PATH, candidates)
        save_json(RULES_PATH, rules_doc)
    print(f"Verified this session: {done['approved']} approved, {done['rejected']} rejected. "
          f"{sum(1 for c in candidates if c.get('status') == 'pending')} still pending.")


if __name__ == "__main__":
    main()
