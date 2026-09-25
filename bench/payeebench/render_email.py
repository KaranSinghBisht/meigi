"""Assemble e-mails and chat messages from the split phrase pools. Every pick is recorded, so each item carries the
exact template signature it was built from (the leakage report checks that test signatures never occur in train)."""
from . import phrases_en, phrases_ja, phrases_ja2


class StrictFormat(dict):
    def __missing__(self, key):
        raise KeyError(f"template placeholder {{{key}}} has no value")


class Composer:
    """Picks phrases for one item: `lang` selects the pools, `split` the train or test phrasings."""

    def __init__(self, rng, split, lang, ctx):
        self.rng, self.lang, self.ctx = rng, lang, StrictFormat(ctx)
        self.side = "test" if split == "test" else "train"
        self.picks = []

    def pool(self, name):
        if self.lang == "en":
            return getattr(phrases_en, name)
        return getattr(phrases_ja, name, None) or getattr(phrases_ja2, name)

    def say(self, name, index=None):
        """A phrase from slot `name`; `index` pins the choice (a subject that must match its body)."""
        options = self.pool(name)[self.side]
        i = self.rng.randrange(len(options)) if index is None else index
        self.picks.append(f"{name}:{self.side}{i}")
        self.last = i
        return options[i].format_map(self.ctx)

    def signature(self, kind):
        return f"{kind}.{self.lang}|" + ",".join(self.picks)


def _join(*parts):
    return "\n".join(p for p in parts if p)


def _para(c, *parts):
    sep = " " if c.lang == "en" else ""
    return sep.join(p for p in parts if p)


def change_legit(c):
    body = _join(c.say("ADDRESSEE"), "", c.say("OPENER"), _para(c, c.say("CHANGE_REASON"), c.say("CHANGE_EFFECTIVE")),
                 c.say("CHANGE_TRANSITION"), "", c.say("ACCOUNT_BLOCK"), "", c.say("CHANGE_VERIFY"), c.say("CLOSING"), "",
                 c.say("SIGNATURE"))
    return c.say("CHANGE_SUBJECT"), body


def fraud_change(c, urgent, secrecy, note):
    """note: None, "PERSONAL_NOTE" or "OVERSEAS_NOTE" (a justification scammers add for an odd account)."""
    ask = c.say("FRAUD_URGENT") if urgent else c.say("FRAUD_POLITE")
    intro = c.say("SELF_INTRO") if c.lang == "ja" else ""
    body = _join(c.say("ADDRESSEE"), "", c.say("OPENER"), intro, ask, "", c.ctx["new"], c.say(note) if note else "",
                 "", c.say("FRAUD_SECRECY") if secrecy else "", c.say("FRAUD_REPLY"), c.say("CLOSING"), "", c.say("SIGNATURE"))
    return c.say("FRAUD_SUBJECT"), body


def reminder(c, overdue):
    if overdue:
        main = _join(c.say("OVERDUE"), c.say("REMIND_SAME_ACCOUNT"), c.say("OVERDUE_CONSEQUENCE"))
        subject = c.say("OVERDUE_SUBJECT")
    else:
        main = _join(c.say("REMIND_GENTLE"), c.say("REMIND_SAME_ACCOUNT"))
        subject = c.say("REMIND_SUBJECT")
    body = _join(c.say("ADDRESSEE"), "", c.say("OPENER"), main, c.say("REMIND_SORRY"), "", c.say("SIGNATURE"))
    return subject, body


def credit(c):
    head = _join(c.say("ADDRESSEE"), "", c.say("OPENER"))
    what = c.say("CREDIT_BODY")
    subject = c.say("CREDIT_SUBJECT", index=c.last)
    body = _join(head, what, c.say("CREDIT_DETAIL"), c.say("CREDIT_SETTLE"), c.say("CLOSING"), "", c.say("SIGNATURE"))
    return subject, body


def refund_scam(c, urgent):
    body = _join(c.say("ADDRESSEE"), "", c.say("OPENER"), c.say("REFUND_SCAM_BODY"), "", c.ctx["new"], "",
                 c.say("REFUND_SCAM_URGENT") if urgent else c.say("REFUND_SCAM_CALM"), "", c.say("SIGNATURE"))
    return c.say("REFUND_SCAM_SUBJECT"), body


def notice(c):
    kinds = c.pool("NOTICE")[c.side]
    kind = c.rng.choice(sorted(kinds))
    c.picks.append(f"NOTICE:{c.side}.{kind}")
    subject, text = kinds[kind]
    body = _join(c.say("ADDRESSEE"), "", c.say("OPENER"), text.format_map(c.ctx), c.say("CLOSING"), "", c.say("SIGNATURE"))
    return subject, body, kind


def exec_legit(c):
    return c.say("EXEC_SUBJECT"), c.say("EXEC_LEGIT")


def fake_exec(c, vendor_redirect=False):
    body = _join(c.say("FAKE_EXEC_VENDOR" if vendor_redirect else "FAKE_EXEC"), "", c.ctx["new"])
    return c.say("FAKE_EXEC_SUBJECT"), body
