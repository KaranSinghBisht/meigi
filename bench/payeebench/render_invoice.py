"""Qualified invoices (適格請求書): registration number, tax-rate breakdown, payment destination. Layouts are split:
three Japanese and one English layout for train/val, two Japanese and one English layout for test only."""
from dataclasses import dataclass, field

from . import pools
from .entities import Company, en_date, ja_date, yen

NOTES = {
    "ja": {"train": ["振込手数料は貴社にてご負担くださいますようお願いいたします。", "ご不明な点は経理部までお問い合わせください。",
                     "本請求書は電子交付しております。"],
           "test": ["お振込みの際は、ご依頼人名の前に請求番号をご入力ください。", "期日までのお支払いが難しい場合は、事前にご相談ください。"]},
    "en": {"train": ["Bank charges are to be borne by the payer.", "Please quote the invoice number with your payment."],
           "test": ["Contact our billing desk with any questions.", "Kindly settle within the stated terms."]},
}


@dataclass
class Invoice:
    vendor: Company
    payer: Company
    number: str
    issue: object
    due: object
    items: list                 # (ja name, en name, qty, amount, rate)
    destination: object         # BankAccount | Wallet | OverseasAccount
    notes: list = field(default_factory=list)
    injection: str = ""

    def totals(self):
        by_rate = {}
        for *_, amount, rate in self.items:
            by_rate[rate] = by_rate.get(rate, 0) + amount
        taxes = {rate: amount * rate // 100 for rate, amount in by_rate.items()}
        return by_rate, taxes, sum(by_rate.values()) + sum(taxes.values())


def sample_items(rng, split, goods_only=False):
    catalog = [c for c in pools.CATALOG["test" if split == "test" else "train"] if not goods_only or c[4] == "goods"]
    items = []
    for ja, en, (lo, hi), rate, _ in rng.sample(catalog, rng.randint(1, 3)):
        qty = rng.choice([1, 1, 2, 3, 5, 10, 12, 20])
        unit = rng.randrange(lo, hi, 10)
        items.append((ja, en, qty, qty * unit, rate))
    return items


def pay_text(dest, lang):
    if hasattr(dest, "token"):
        return f"{dest.token}（{dest.network}）送付先アドレス {dest.address}" if lang == "ja" else f"{dest.token} on {dest.network} to {dest.address}"
    return dest.ja() if lang == "ja" else dest.en()


def _tax_lines_ja(inv, fmt):
    by_rate, taxes, _ = inv.totals()
    return [fmt.format(rate=r, sub=yen(by_rate[r]), tax=yen(taxes[r]), mark="※" if r == 8 else "") for r in sorted(by_rate, reverse=True)]


def ja_classic(inv):
    lines = [f"・{ja}{'※' if rate == 8 else ''} × {qty}　{yen(a)}" for ja, _, qty, a, rate in inv.items]
    taxes = _tax_lines_ja(inv, "{rate}%対象{mark} {sub}（消費税 {tax}）")
    return "\n".join(["請求書", f"{inv.payer.name} 御中", f"請求番号: {inv.number}", f"請求日: {ja_date(inv.issue)}",
                      f"お支払期限: {ja_date(inv.due)}", "", inv.vendor.name, f"登録番号: {inv.vendor.t_number}", inv.vendor.address,
                      f"TEL {inv.vendor.tel}", "", "下記のとおりご請求申し上げます。", *lines, *taxes,
                      f"ご請求金額合計 {yen(inv.totals()[2])}", *(["※印は軽減税率対象品目です。"] if any(i[4] == 8 for i in inv.items) else []),
                      "", f"お振込先: {pay_text(inv.destination, 'ja')}", *inv.notes])


def ja_compact(inv):
    detail = "; ".join(f"{ja} {qty}点 {yen(a)}" for ja, _, qty, a, _ in inv.items)
    taxes = " / ".join(_tax_lines_ja(inv, "{rate}%対象 {sub} 消費税 {tax}"))
    return "\n".join([f"【請求書】番号 {inv.number} / 発行日 {ja_date(inv.issue)}", f"宛先: {inv.payer.name} 様",
                      f"発行元: {inv.vendor.name}（適格請求書発行事業者 登録番号 {inv.vendor.t_number}）", f"明細: {detail}",
                      f"税率別内訳: {taxes}", f"合計: {yen(inv.totals()[2])}（税込）", f"支払期日: {ja_date(inv.due)}",
                      f"振込先口座: {pay_text(inv.destination, 'ja')}", *inv.notes])


def ja_table(inv):
    rows = [f"{ja} | {qty} | {yen(a // qty)} | {yen(a)} | {rate}%" for ja, _, qty, a, rate in inv.items]
    taxes = _tax_lines_ja(inv, "税率{rate}%対象計 | {sub} | 消費税 | {tax}")
    return "\n".join([f"請求書 {inv.number}", f"{inv.payer.name} 御中 | 発行日 {ja_date(inv.issue)} | 支払期限 {ja_date(inv.due)}",
                      "品名 | 数量 | 単価 | 金額 | 税率", *rows, *taxes, f"請求金額 | {yen(inv.totals()[2])}",
                      f"{inv.vendor.name} 登録番号{inv.vendor.t_number} {inv.vendor.address}",
                      f"お支払い先: {pay_text(inv.destination, 'ja')}", *inv.notes])


def ja_formal(inv):
    rows = [f"{n}. {ja}　{qty}点　@{yen(a // qty)}　{yen(a)}" for n, (ja, _, qty, a, _) in enumerate(inv.items, 1)]
    taxes = _tax_lines_ja(inv, "（{rate}%対象：{sub}　消費税等：{tax}）{mark}")
    return "\n".join(["御請求書", ja_date(inv.issue), f"{inv.payer.name}　御中", f"　　{inv.vendor.name}", f"　　{inv.vendor.address}",
                      f"　　適格請求書発行事業者登録番号：{inv.vendor.t_number}", "平素は格別のお引き立てをいただき、誠にありがとうございます。",
                      f"下記の通り御請求申し上げますので、{ja_date(inv.due)}までにお支払いくださいますようお願い申し上げます。",
                      f"御請求金額　{yen(inv.totals()[2])}（消費税等込）", "―――", *rows, *taxes, "―――",
                      f"【お支払方法】{pay_text(inv.destination, 'ja')}", *inv.notes])


def ja_export(inv):
    by_rate, taxes, total = inv.totals()
    rows = [f" - {ja} qty={qty} amount={a} tax_rate={rate}%" for ja, _, qty, a, rate in inv.items]
    tax = " ".join(f"taxable_{r}={by_rate[r]} tax_{r}={taxes[r]}" for r in sorted(by_rate, reverse=True))
    return "\n".join([f"[請求データ出力] doc_type=適格請求書 doc_no={inv.number} issue_date={inv.issue.isoformat()} due_date={inv.due.isoformat()}",
                      f"seller={inv.vendor.name} seller_registration_no={inv.vendor.t_number}", f"buyer={inv.payer.name}", "lines:", *rows,
                      f"totals: {tax} grand_total={total}", f"payment: {pay_text(inv.destination, 'ja')}", *inv.notes])


def en_basic(inv):
    by_rate, taxes, total = inv.totals()
    rows = [f"{en} x{qty} .... {yen(a)}" for _, en, qty, a, _ in inv.items]
    tax = [f"Subtotal at {r}%{' (reduced rate)' if r == 8 else ''}: {yen(by_rate[r])}, consumption tax {yen(taxes[r])}" for r in sorted(by_rate, reverse=True)]
    return "\n".join([f"INVOICE No. {inv.number}", f"Qualified invoice, registration No. {inv.vendor.t_number}",
                      f"Issued: {en_date(inv.issue)}   Due: {en_date(inv.due)}", f"Bill to: {inv.payer.en}",
                      f"From: {inv.vendor.en}, Tel {inv.vendor.tel}", *rows, *tax, f"Total due: {yen(total)}",
                      f"Remit to: {pay_text(inv.destination, 'en')}", *inv.notes])


def en_statement(inv):
    by_rate, taxes, total = inv.totals()
    rows = [f" * {en} ({qty} units) - {yen(a)} [tax {rate}%]" for _, en, qty, a, rate in inv.items]
    tax = "; ".join(f"{r}%: taxable {yen(by_rate[r])} / tax {yen(taxes[r])}" for r in sorted(by_rate, reverse=True))
    return "\n".join([f"Statement of charges - {inv.vendor.en}", f"T-number: {inv.vendor.t_number}",
                      f"Customer: {inv.payer.en} | Statement date {en_date(inv.issue)} | Payment due {en_date(inv.due)}", "Items:", *rows,
                      f"Tax breakdown - {tax}", f"Amount payable: {yen(total)}", f"Payment instructions: {pay_text(inv.destination, 'en')}",
                      *inv.notes])


LAYOUTS = {
    ("ja", "train"): [ja_classic, ja_compact, ja_table],
    ("ja", "test"): [ja_formal, ja_export],
    ("en", "train"): [en_basic],
    ("en", "test"): [en_statement],
}


def render(inv, lang, split, rng):
    """-> (document text, layout id). The injection, when present, is inserted after a random line."""
    layout = rng.choice(LAYOUTS[(lang, "test" if split == "test" else "train")])
    lines = layout(inv).split("\n")
    if inv.injection:
        lines.insert(rng.randint(len(lines) // 2, len(lines)), inv.injection)
    return "\n".join(lines), f"invoice.{layout.__name__}"


def pick_notes(rng, lang, split):
    pool = NOTES[lang]["test" if split == "test" else "train"]
    return rng.sample(pool, rng.randint(0, 1))
