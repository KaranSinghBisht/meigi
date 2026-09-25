"""Fictional companies, people, bank accounts and wallets, sampled per split from pools.py."""
import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from . import pools
from .tnumber import random_t_number

SMALL_KANA = str.maketrans("ァィゥェォッャュョヮ", "アイウエオツヤユヨワ")
LEGAL_FORMS = [("株式会社", "prefix", "カ）", "Co., Ltd."), ("株式会社", "suffix", "（カ", "Co., Ltd."),
               ("合同会社", "prefix", "ド）", "LLC"), ("有限会社", "prefix", "ユ）", "Ltd.")]


def zengin(kana):
    """Bank-transfer (全銀) style katakana: small kana are written full size."""
    return kana.translate(SMALL_KANA)


@dataclass(frozen=True)
class Company:
    name: str
    holder: str        # account-holder name as banks print it, e.g. カ）ハルカゼセイキ
    en: str
    domain: str
    t_number: str
    address: str
    tel: str


@dataclass(frozen=True)
class Person:
    kanji: str
    kana: str
    en: str
    local: str         # e-mail local part


@dataclass(frozen=True)
class BankAccount:
    bank: str
    bank_en: str
    branch: str
    branch_en: str
    kind: str          # 普通 or 当座
    number: str
    holder: str

    def ja(self):
        return f"{self.bank} {self.branch} {self.kind} {self.number} {self.holder}"

    def en(self):
        kind = "Savings (Futsu)" if self.kind == "普通" else "Checking (Toza)"
        return f"{self.bank_en}, {self.branch_en}, {kind} {self.number}, account name {self.holder}"


@dataclass(frozen=True)
class Wallet:
    token: str
    network: str
    address: str

    def ja(self):
        return f"{self.token}（{self.network}）{self.address}"

    def en(self):
        return f"{self.token} on {self.network}: {self.address}"


@dataclass(frozen=True)
class OverseasAccount:
    bank: str
    city: str
    beneficiary: str
    number: str
    swift: str

    def ja(self):
        return f"{self.bank}（{self.city}） SWIFT {self.swift} 口座番号 {self.number} 受取人 {self.beneficiary}"

    def en(self):
        return f"{self.bank} ({self.city}), SWIFT {self.swift}, account {self.number}, beneficiary {self.beneficiary}"


class EntityFactory:
    """Samples entities for one split; company names, T-numbers, accounts and wallets are unique across the whole
    build because the factories of all splits share `used`."""

    def __init__(self, split, rng: random.Random, used: set, avoid_numbers=frozenset(), avoid_names=frozenset()):
        self.split, self.rng, self.used, self.avoid, self.avoid_names = split, rng, used, avoid_numbers, avoid_names
        self.log = defaultdict(set)   # every entity this split used, for the leakage report

    def _unique(self, make):
        for _ in range(1000):
            value = make()
            if value not in self.used:
                self.used.add(value)
                return value
        raise RuntimeError("entity pool exhausted")

    def company(self):
        """A company name never used before in this build and not a registered corporation in `avoid_names`."""
        for _ in range(1000):
            stem, industry = self.rng.choice(pools.COMPANY_STEMS[self.split]), self.rng.choice(pools.INDUSTRIES)
            form, position, abbr, en_form = self.rng.choices(LEGAL_FORMS, weights=[5, 3, 1, 1])[0]
            core = stem[0] + industry[0]
            name = f"{form}{core}" if position == "prefix" else f"{core}{form}"
            if name not in self.used and name not in self.avoid_names:
                break
        else:
            raise RuntimeError("company name pool exhausted")
        self.used.add(name)
        reading = zengin(stem[1] + industry[1])
        holder = f"{abbr}{reading}" if position == "prefix" else f"{reading}{abbr}"
        en = f"{stem[2].capitalize()} {industry[3]} {en_form}"
        tel = f"0{self.rng.choice(['3', '6', '45', '52', '92'])}-{self.rng.randrange(1000, 9999)}-{self.rng.randrange(1000, 9999)}"
        address = f"{self.rng.choice(pools.WARDS[self.split])}{self.rng.randint(1, 5)}-{self.rng.randint(1, 30)}-{self.rng.randint(1, 20)}"
        t_number = self._unique(lambda: random_t_number(self.rng, self.avoid))
        self.log["company"].add(name); self.log["t_number"].add(t_number)
        return Company(name, holder, en, f"{stem[2]}-{industry[2]}.example", t_number, address, tel)

    def person(self):
        sur, given = self.rng.choice(pools.SURNAMES[self.split]), self.rng.choice(pools.GIVEN_NAMES[self.split])
        self.log["person"].add(f"{sur[0]} {given[0]}")
        return Person(f"{sur[0]} {given[0]}", f"{sur[1]} {given[1]}", f"{given[2]} {sur[2]}", f"{given[2][0].lower()}.{sur[2].lower()}")

    def people(self, k):
        """k people with distinct surnames (so an executive never greets a namesake)."""
        out = []
        for sur in self.rng.sample(pools.SURNAMES[self.split], k):
            given = self.rng.choice(pools.GIVEN_NAMES[self.split])
            self.log["person"].add(f"{sur[0]} {given[0]}")
            out.append(Person(f"{sur[0]} {given[0]}", f"{sur[1]} {given[1]}", f"{given[2]} {sur[2]}", f"{given[2][0].lower()}.{sur[2].lower()}"))
        return out

    def bank_account(self, holder, bank=None):
        bank = bank or self.rng.choice(pools.BANKS[self.split])
        branch = self.rng.choice(pools.BRANCHES[self.split])
        kind = self.rng.choices(["普通", "当座"], weights=[4, 1])[0]
        number = self._unique(lambda: f"{self.rng.randrange(10**6, 10**7)}")
        self.log["bank"].add(bank[0]); self.log["account"].add(number)
        return BankAccount(bank[0], bank[2], branch[0], branch[1], kind, number, holder)

    def moved_account(self, account):
        """Same holder, another bank of this split: what a real or fake payee change looks like."""
        others = [b for b in pools.BANKS[self.split] if b[0] != account.bank]
        return self.bank_account(account.holder, self.rng.choice(others))

    def lookalike_account(self, account):
        """Same bank, branch and holder; two adjacent digits swapped (a typo-level tamper)."""
        digits = list(account.number)
        i = self.rng.randrange(len(digits) - 1)
        while digits[i] == digits[i + 1]:
            i = (i + 1) % (len(digits) - 1)
        digits[i], digits[i + 1] = digits[i + 1], digits[i]
        return BankAccount(account.bank, account.bank_en, account.branch, account.branch_en, account.kind, "".join(digits), account.holder)

    def personal_account(self, person=None):
        person = person or self.person()
        return self.bank_account(zengin(person.kana))

    def wallet(self, token=None, network=None):
        token = token or self.rng.choice(["JPYC", "JPYC", "USDC"])
        network = network or self.rng.choice(["Polygon", "Ethereum", "Avalanche"] if token == "JPYC" else ["Base", "Ethereum", "Polygon"])
        wallet = Wallet(token, network, self._unique(lambda: "0x" + "".join(self.rng.choice("0123456789abcdef") for _ in range(40))))
        self.log["wallet"].add(wallet.address)
        return wallet

    def lookalike_wallet(self, wallet):
        """Address-poisoning style: same first six and last four hex digits, different middle."""
        head, tail = wallet.address[:8], wallet.address[-4:]
        middle = lambda: "".join(self.rng.choice("0123456789abcdef") for _ in range(30))
        return Wallet(wallet.token, wallet.network, self._unique(lambda: head + middle() + tail))

    def overseas_account(self):
        bank, city = self.rng.choice(pools.OVERSEAS[self.split])
        swift = "".join(self.rng.choice("ABCDEFGHJKLMNPRSTUVWXYZ") for _ in range(6)) + f"{self.rng.randrange(10, 99)}"
        number = self._unique(lambda: f"{self.rng.randrange(100, 999)}-{self.rng.randrange(100000, 999999)}-{self.rng.randrange(100, 999)}")
        self.log["account"].add(number)
        return OverseasAccount(bank, city, self.rng.choice(pools.BENEFICIARIES[self.split]), number, swift)

    def lookalike_domain(self, domain):
        name, _, tld = domain.rpartition(".")
        swaps = [name.replace("i", "l", 1), name.replace("m", "rn", 1), name + "-jp", name.replace("-", ""), name.replace("o", "0", 1)]
        options = [s for s in swaps if s != name]
        return f"{self.rng.choice(options)}.{tld}"

    def issue_date(self):
        return date(2026, 8, 1) + timedelta(days=self.rng.randrange(80))


def month_end_after(d, months=1):
    y, m = d.year + (d.month + months - 1) // 12, (d.month + months - 1) % 12 + 1
    nxt = date(y + (m // 12), m % 12 + 1, 1)
    return nxt - timedelta(days=1)


def ja_date(d):
    return f"{d.year}年{d.month}月{d.day}日"


def en_date(d):
    return d.strftime("%B %-d, %Y")


def yen(n):
    return f"¥{n:,}"
