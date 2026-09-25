"""Qualified-invoice registration numbers (登録番号): "T" + a 13-digit corporate number (法人番号) whose first digit
is a check digit over the other twelve:

    check = 9 - (sum(Pn * Qn) mod 9)
    Pn = the n-th digit of the 12-digit base counted from the right (n = 1..12)
    Qn = 1 when n is odd, 2 when n is even
"""
import random


def check_digit(base12):
    if len(base12) != 12 or not base12.isdigit():
        raise ValueError("the base must be exactly 12 digits")
    total = sum(int(d) * (1 if n % 2 else 2) for n, d in enumerate(reversed(base12), start=1))
    return 9 - total % 9


def is_valid_corporate_number(number):
    return len(number) == 13 and number.isdigit() and int(number[0]) == check_digit(number[1:])


def is_valid_t_number(t_number):
    return t_number.startswith("T") and is_valid_corporate_number(t_number[1:])


def random_corporate_number(rng: random.Random, avoid=frozenset()):
    """A syntactically valid corporate number not in `avoid` (e.g. real registered numbers)."""
    while True:
        base = f"{rng.randrange(10**12):012d}"
        number = f"{check_digit(base)}{base}"
        if number not in avoid:
            return number


def random_t_number(rng: random.Random, avoid=frozenset()):
    return "T" + random_corporate_number(rng, avoid)
