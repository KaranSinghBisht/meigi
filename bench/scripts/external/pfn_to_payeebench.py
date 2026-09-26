"""Turn PFN Japanese-Mail-Bench (Apache-2.0, 500 LLM-written Japanese e-mails) into benign PayeeBench items.

The labels are assumed, not annotated: nothing in these e-mails asks to pay a new account, so the expected answers are
new destination no and suspicion 0. Items that mention money or accounts are marked `payment_related` so they can be
checked by hand or reported apart.

    python pfn_to_payeebench.py --src pfn_test.jsonl --out pfn_benign.jsonl
"""
import argparse
import json
import logging
import re
from pathlib import Path

QUESTIONS = json.loads((Path(__file__).resolve().parents[2] / "dataset" / "questions.json").read_text(encoding="utf-8"))["questions"]
SUBJECT = re.compile(r"^(?:【件名】|件名)\s*[：:]\s*(.+)$")
PAYMENT = re.compile(r"振込|振り込|口座|支払|請求|送金|入金|返金|代金")
BENIGN = {"request_type": "other", "new_destination": False, "pressure": False, "suspicion": 0}


def split_mail(text):
    """(subject, body) from a gold answer whose first line is usually 件名：…; no subject line gives an empty subject."""
    lines = text.strip().strip('"').strip().split("\n")
    match = SUBJECT.match(lines[0].strip())
    if match:
        return match.group(1).strip(), "\n".join(lines[1:]).strip()
    return "", "\n".join(lines).strip()


def to_record(row):
    subject, body = split_mail(row["gold_answer"])
    # some rows have no scenario object; the relation field ("学生 -> 友人") still names the sender
    sender = (row.get("scenario") or {}).get("sender") or row["sender_receiver_relation"].split("->")[0].strip()
    state = {"channel": "email", "from": sender, "subject": subject, "body": body}
    questions = {qid: {**q, "label": BENIGN[qid]} for qid, q in QUESTIONS.items()}
    meta = {"id": f"pfn/{row['id']}", "carrier": "pfn_mail", "attack": None, "goal": None, "ood_carrier": False,
            "payment_related": bool(PAYMENT.search(row["gold_answer"])), "purpose": row["email_purpose"]}
    return {"state": state, "questions": questions, "_meta": meta}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="pfn_test.jsonl")
    ap.add_argument("--out", default="pfn_benign.jsonl")
    a = ap.parse_args()
    rows = [json.loads(line) for line in open(a.src, encoding="utf-8")]
    with open(a.out, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(to_record(row), ensure_ascii=False) + "\n")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger(__name__).info("wrote %d items to %s", len(rows), a.out)


if __name__ == "__main__":
    main()
