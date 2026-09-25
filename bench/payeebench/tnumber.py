"""Qualified-invoice registration numbers (登録番号): "T" + a 13-digit corporate number (法人番号) whose first digit
is a check digit over the other twelve:

    check = 9 - (sum(Pn * Qn) mod 9)
    Pn = the n-th digit of the 12-digit base counted from the right (n = 1..12)
    Qn = 1 when n is odd, 2 when n is even

A valid check digit does not make a number fictional: a random base can belong to a real corporation. Every number
generated here therefore starts its base with registry-office code 9999, which no office has (none of the 5.79M numbers
in the NTA index uses it), so it can never be issued.
"""
import random

UNASSIGNED_OFFICE = "9999"


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
    """A valid, never-issuable corporate number (office 9999) not in `avoid`. Each attempt spends one 12-digit draw and
    keeps its last 8 digits, so the random stream, and every other part of a generated dataset, is unchanged."""
    while True:
        base = UNASSIGNED_OFFICE + f"{rng.randrange(10**12):012d}"[4:]
        number = f"{check_digit(base)}{base}"
        if number not in avoid:
            return number


def is_unassignable(number):
    """True for a 13-digit corporate number (or T-number) in the 9999 office range."""
    digits = number[1:] if number.startswith("T") else number
    return digits[1:5] == UNASSIGNED_OFFICE


def random_t_number(rng: random.Random, avoid=frozenset()):
    return "T" + random_corporate_number(rng, avoid)
