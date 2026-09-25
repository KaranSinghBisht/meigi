"""Per-item context shared by the family samplers: who pays whom, the vendor master record, dates and amounts, and the
placeholder values the phrase pools use."""
from datetime import timedelta

from .entities import en_date, ja_date, month_end_after, yen

EXEC_TITLES = {"ja": ["代表取締役", "社長", "専務取締役", "CFO", "経理部長"], "en": ["CEO", "CFO", "Managing Director", "President"]}
INVOICE_NO = {"train": ["INV-2026-{n:04d}", "No.{n:06d}"], "test": ["{m:02d}{n:03d}-A", "B{n:07d}"]}


def invoice_number(rng, split, issue):
    fmt = rng.choice(INVOICE_NO["test" if split == "test" else "train"])
    return fmt.format(n=rng.randrange(1, 9999), m=issue.month)


def on_file(vendor, destination, lang):
    """The vendor-master line the AP agent attaches: name, T-number, domain, registered destination."""
    if lang == "ja":
        return f"{vendor.name}（{vendor.t_number}、{vendor.domain}）: {destination.ja()}"
    return f"{vendor.en} ({vendor.t_number}, {vendor.domain}): {destination.en()}"


def sender_line(person, domain, lang, local=None):
    name = person.kanji if lang == "ja" else person.en
    return f"{name} <{local or person.local}@{domain}>"


def fmt_date(d, lang):
    return ja_date(d) if lang == "ja" else en_date(d)


def base(fac, rng, lang, wallet_vendor=False):
    """-> dict with entities (vendor, payer, people, on-file destination) and every phrase placeholder."""
    vendor, payer = fac.company(), fac.company()
    sender, contact, sales, accountant, exec_person = fac.people(5)
    account = fac.wallet() if wallet_vendor else fac.bank_account(vendor.holder)
    issue = fac.issue_date()
    due = month_end_after(issue)
    effective = issue + timedelta(days=rng.randint(20, 45))
    total = rng.randrange(40_000, 3_000_000, 10)
    d = lambda x: fmt_date(x, lang)
    name = (lambda p: p.kanji) if lang == "ja" else (lambda p: p.en)
    surname = (lambda p: p.kanji.split()[0]) if lang == "ja" else (lambda p: p.en.split()[-1])
    return {
        "vendor_co": vendor, "payer_co": payer, "sender_p": sender, "exec_p": exec_person, "accountant_p": accountant,
        "account": account, "issue_d": issue, "due_d": due, "total": total,
        "vendor": vendor.name if lang == "ja" else vendor.en, "vendor_en": vendor.en, "payer": payer.name if lang == "ja" else payer.en,
        "contact": name(contact), "sender": name(sender), "sender_surname": surname(sender), "sales": name(sales),
        "tel": vendor.tel, "t_number": vendor.t_number, "address": vendor.address,
        "invoice_no": invoice_number(rng, fac.split, issue), "amount": yen(total), "issue": d(issue), "due": d(due),
        "deadline": d(due + timedelta(days=rng.randint(5, 10))), "effective": d(effective),
        "cutover": d(effective + timedelta(days=30)), "letter_date": d(effective - timedelta(days=7)),
        "refund_date": d(issue + timedelta(days=rng.randint(10, 25))), "date": d(issue + timedelta(days=rng.randint(7, 40))),
        "account_text": account.ja() if lang == "ja" else account.en(),
        "accountant": surname(accountant), "exec": surname(exec_person),
        "exec_title": rng.choice(EXEC_TITLES[lang]),
    }


def finish(ctx, lang, **extra):
    """Placeholder dict for Composer: the plain string values of ctx plus family-specific ones."""
    values = {k: v for k, v in ctx.items() if isinstance(v, str)}
    values["account"] = ctx["account_text"]
    values.update(extra)
    return values
