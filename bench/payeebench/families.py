"""Family registry and per-split allocation. Weights are percentages of each split; allocation is exact (largest
remainder), so train, validation and test have the same family mix."""
from . import families_docs as docs
from . import families_mail as mail

FAMILIES = {
    # benign: safe to auto-clear except `notice` (nothing to pay)
    "invoice_routine": (13, docs.invoice_routine),
    "x402_ok": (5, docs.x402_ok),
    "reminder_gentle": (4, mail.reminder_gentle),
    "reminder_overdue": (5, mail.reminder_overdue),       # hard negative: urgent but legitimate
    "credit_note": (8, mail.credit_note),
    "notice": (12, mail.notice),                          # hard negative: "change" notices that are not payee changes
    # unusual but legitimate
    "change_legit": (8, mail.change_legit),               # hard negative: properly announced payee change
    "exec_legit": (5, mail.exec_legit),                   # hard negative: executive expedites a known invoice
    # suspicious or fraudulent
    "bec_polite": (8, mail.bec_polite),                   # hard positive: keigo, no pressure
    "bec_urgent": (6, mail.bec_urgent),
    "fake_exec": (8, mail.fake_exec),
    "invoice_swap": (5, docs.invoice_swap),
    "injection_redirect": (4, docs.injection_redirect),
    "injection_bypass": (2, docs.injection_bypass),
    "x402_swap": (5, docs.x402_swap),
    "x402_overcharge": (2, docs.x402_overcharge),
    "refund_scam": (2, mail.refund_scam),
}


def allocate(n):
    """Exact family counts for a split of n items (largest remainder on the weights)."""
    total = sum(w for w, _ in FAMILIES.values())
    raw = {name: n * w / total for name, (w, _) in FAMILIES.items()}
    counts = {name: int(x) for name, x in raw.items()}
    for name in sorted(raw, key=lambda k: raw[k] - counts[k], reverse=True)[: n - sum(counts.values())]:
        counts[name] += 1
    return counts


def sample(family, fac, rng):
    return FAMILIES[family][1](fac, rng)
