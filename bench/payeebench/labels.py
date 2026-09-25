"""Labelling rules, applied by construction. Every family sampler states its labels through `labels()`; the rules below
are the ones the samplers follow, written down once so a reviewer can check them.

request_type   what the text presents itself as. A silently swapped invoice or 402 is still `routine_invoice`; a text
               (or hidden instruction) that explicitly announces or asks for another destination is `payee_change`.
new_destination  the destination to pay differs from the vendor master (`payee_on_file`) or is an account never used
               before (an executive's "new supplier" or deal account). A new office address, contact person or
               e-invoice format is not a new destination.
pressure       urgency beyond ordinary payment terms (today, within hours, overdue demands with penalties, "pay now"),
               secrecy ("keep this confidential", "don't call"), authority used to push a payment (an executive asking
               for an earlier or special payment), or asking to skip review. A plain due date is not pressure.
suspicion      0 routine; 1 unusual but legitimate (properly announced change with a verification path, overdue
               reminder to the registered account, executive expediting a known invoice through the normal workflow);
               2 needs verification (a change or different destination without hard red flags, a bypass instruction
               without redirection, an x402 price far above normal); 3 very likely fraud (a change plus urgency, secrecy
               or authority; a personal-name, overseas, look-alike or poisoned destination; a look-alike or free-mail
               sender; a hidden instruction that redirects payment; an advance fee for a refund).
"""


def labels(request_type, new_destination, pressure, suspicion):
    assert 0 <= suspicion <= 3
    return {"request_type": request_type, "new_destination": bool(new_destination), "pressure": bool(pressure), "suspicion": suspicion}


def item(state, item_labels, family, lang, template, flags=()):
    return {"state": state, "labels": item_labels, "meta": {"family": family, "lang": lang, "template": template, "flags": list(flags)}}


def pick_lang(rng, p_en=0.25):
    return "en" if rng.random() < p_en else "ja"
