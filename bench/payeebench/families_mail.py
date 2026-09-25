"""Message families: vendor e-mails (payee changes, reminders, credit notes, notices, refund scams) and executive
requests (legitimate expedites and impersonation). Labels follow labels.py."""
from . import context, pools, render_email
from .entities import yen
from .labels import item, labels, pick_lang
from .render_email import Composer
from .render_invoice import sample_items


def _email(ctx, lang, sender, subject, body, rng, p_on_file):
    state = {"channel": "email"}
    if rng.random() < p_on_file:
        state["payee_on_file"] = context.on_file(ctx["vendor_co"], ctx["account"], lang)
    state.update({"from": sender, "subject": subject, "body": body})
    return state


def _text(dest, lang):
    return dest.ja() if lang == "ja" else dest.en()


def _vendor_sender(ctx, lang):
    return context.sender_line(ctx["sender_p"], ctx["vendor_co"].domain, lang)


def change_legit(fac, rng):
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    new = fac.moved_account(ctx["account"])
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang, new=_text(new, lang), old=ctx["account_text"]))
    subject, body = render_email.change_legit(c)
    state = _email(ctx, lang, _vendor_sender(ctx, lang), subject, body, rng, 0.6)
    return item(state, labels("payee_change", True, False, 1), "change_legit", lang, c.signature("change_legit"))


def _fraud_sender(fac, rng, ctx, lang, weights):
    kind = rng.choices(["same", "lookalike", "freemail"], weights=weights)[0]
    if kind == "same":
        return _vendor_sender(ctx, lang), kind
    if kind == "lookalike":
        return context.sender_line(ctx["sender_p"], fac.lookalike_domain(ctx["vendor_co"].domain), lang), kind
    local = f"{ctx['vendor_co'].domain.split('-')[0]}.{ctx['sender_p'].local.split('.')[-1]}{rng.randrange(10, 99)}"
    return context.sender_line(ctx["sender_p"], rng.choice(pools.FREE_MAIL), lang, local), kind


def _fraud_account(fac, rng, ctx, weights):
    kind = rng.choices(["moved", "personal", "overseas"], weights=weights)[0]
    dest = {"moved": lambda: fac.moved_account(ctx["account"]), "personal": fac.personal_account, "overseas": fac.overseas_account}[kind]()
    note = {"personal": "PERSONAL_NOTE", "overseas": "OVERSEAS_NOTE"}.get(kind) if rng.random() < 0.5 else None
    return dest, kind, note


def bec_change(fac, rng, urgent):
    """Fraudulent change request. Polite ones carry no pressure; they are level 2 only when nothing but the unannounced
    change is wrong (vendor's own domain, same holder at another bank)."""
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    sender, sender_kind = _fraud_sender(fac, rng, ctx, lang, [3, 2, 1])
    dest, acct_kind, note = _fraud_account(fac, rng, ctx, [3, 2, 1])
    secrecy = urgent and rng.random() < 0.5
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang, new=_text(dest, lang)))
    subject, body = render_email.fraud_change(c, urgent, secrecy, note)
    hard = urgent or sender_kind != "same" or acct_kind != "moved"
    state = _email(ctx, lang, sender, subject, body, rng, 0.6)
    family = "bec_urgent" if urgent else "bec_polite"
    return item(state, labels("payee_change", True, urgent, 3 if hard else 2), family, lang, c.signature(family), [sender_kind, acct_kind])


def bec_polite(fac, rng):
    return bec_change(fac, rng, urgent=False)


def bec_urgent(fac, rng):
    return bec_change(fac, rng, urgent=True)


def reminder(fac, rng, overdue):
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang))
    subject, body = render_email.reminder(c, overdue)
    state = _email(ctx, lang, _vendor_sender(ctx, lang), subject, body, rng, 0.6)
    family = "reminder_overdue" if overdue else "reminder_gentle"
    return item(state, labels("routine_invoice", False, overdue, 1 if overdue else 0), family, lang, c.signature(family))


def reminder_gentle(fac, rng):
    return reminder(fac, rng, overdue=False)


def reminder_overdue(fac, rng):
    return reminder(fac, rng, overdue=True)


def credit_note(fac, rng):
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    ja, en, qty, amount, rate = sample_items(rng, fac.split, goods_only=True)[0]
    extra = {"item": ja if lang == "ja" else en, "qty": str(qty), "rate": str(rate), "amount": yen(amount), "tax": yen(amount * rate // (100 + rate))}
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang, **extra))
    subject, body = render_email.credit(c)
    state = _email(ctx, lang, _vendor_sender(ctx, lang), subject, body, rng, 0.5)
    return item(state, labels("credit_note", False, False, 0), "credit_note", lang, c.signature("credit_note"))


def refund_scam(fac, rng):
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    sender, sender_kind = _fraud_sender(fac, rng, ctx, lang, [1, 2, 2])
    dest, acct_kind, _ = _fraud_account(fac, rng, ctx, [1, 2, 1])
    urgent = rng.random() < 0.6
    fee = yen(rng.choice([3300, 5500, 11000, 22000, 55000]))
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang, new=_text(dest, lang), fee=fee, amount=yen(rng.randrange(12_000, 380_000, 100))))
    subject, body = render_email.refund_scam(c, urgent)
    state = _email(ctx, lang, sender, subject, body, rng, 0.4)
    return item(state, labels("credit_note", True, urgent, 3), "refund_scam", lang, c.signature("refund_scam"), [sender_kind, acct_kind])


def notice(fac, rng):
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    moved = fac.company()
    extra = {"new_address": moved.address, "new_tel": moved.tel, "old_person": ctx["sales"], "new_person": ctx["contact"]}
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang, **extra))
    subject, body, kind = render_email.notice(c)
    state = _email(ctx, lang, _vendor_sender(ctx, lang), subject, body, rng, 0.4)
    return item(state, labels("other", False, False, 0), "notice", lang, c.signature("notice"), [kind])


def _exec_from(ctx, lang, domain, local=None):
    person, title = ctx["exec_p"], ctx["exec_title"]
    name = f"{person.kanji}（{title}）" if lang == "ja" else f"{person.en} ({title})"
    return f"{name} <{local or person.local}@{domain}>"


def exec_legit(fac, rng):
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang))
    subject, body = render_email.exec_legit(c)
    sender = _exec_from(ctx, lang, ctx["payer_co"].domain)
    if rng.random() < 0.4:
        state = {"channel": "chat", "from": sender.split(" <")[0], "body": body}
    else:
        state = _email(ctx, lang, sender, subject, body, rng, 0.0)
    if rng.random() < 0.6:
        state = {"channel": state["channel"], "payee_on_file": context.on_file(ctx["vendor_co"], ctx["account"], lang),
                 **{k: v for k, v in state.items() if k != "channel"}}
    return item(state, labels("urgent_exec_request", False, True, 1), "exec_legit", lang, c.signature("exec_legit"), [state["channel"]])


def _fake_exec_sender(fac, rng, ctx, lang):
    if rng.random() < 0.6:
        return _exec_from(ctx, lang, fac.lookalike_domain(ctx["payer_co"].domain)), "lookalike"
    local = f"{ctx['exec_p'].local.replace('.', '')}.{rng.choice(['office', 'ceo', 'private'])}"
    return _exec_from(ctx, lang, rng.choice(pools.FREE_MAIL), local), "freemail"


def fake_exec(fac, rng):
    """Executive impersonation: a confidential deal to a new account, or a known vendor's invoice to a "new" account."""
    lang = pick_lang(rng)
    ctx = context.base(fac, rng, lang)
    vendor_redirect = rng.random() < 0.3
    kinds = ["moved", "personal"] if vendor_redirect else ["overseas", "overseas", "personal", "unknown_company"]
    kind = rng.choice(kinds)
    dest = {"overseas": fac.overseas_account, "personal": fac.personal_account, "moved": lambda: fac.moved_account(ctx["account"]),
            "unknown_company": lambda: fac.bank_account(fac.company().holder)}[kind]()
    amount = ctx["amount"] if vendor_redirect else yen(rng.randrange(20, 480) * 100_000)
    c = Composer(rng, fac.split, lang, context.finish(ctx, lang, new=_text(dest, lang), amount=amount))
    subject, body = render_email.fake_exec(c, vendor_redirect)
    sender, sender_kind = _fake_exec_sender(fac, rng, ctx, lang)
    if rng.random() < 0.3:
        tag = "（個人アカウント）" if lang == "ja" else " (personal account)"
        state, sender_kind = {"channel": "chat", "from": sender.split(" <")[0] + tag, "body": body}, "chat_personal"
    else:
        state = {"channel": "email", "from": sender, "subject": subject, "body": body}
    if vendor_redirect and rng.random() < 0.7:
        state = {"channel": state["channel"], "payee_on_file": context.on_file(ctx["vendor_co"], ctx["account"], lang),
                 **{k: v for k, v in state.items() if k != "channel"}}
    flags = [kind, sender_kind] + (["vendor_redirect"] if vendor_redirect else [])
    return item(state, labels("urgent_exec_request", True, True, 3), "fake_exec", lang, c.signature("fake_exec"), flags)
