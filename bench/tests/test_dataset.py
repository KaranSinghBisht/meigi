import random

import pytest

from payeebench import build, families
from payeebench.entities import EntityFactory, unassigned_phone
from payeebench.schema import QUESTIONS, is_safe, option_keys, p_safe
from payeebench.tnumber import check_digit, is_unassignable, is_valid_t_number, random_t_number


@pytest.mark.parametrize("number", ["7000012050002", "1000011000005", "1000012010003"])   # NTA, National Diet Library, CLB
def test_check_digit_matches_published_corporate_numbers(number):
    assert check_digit(number[1:]) == int(number[0])


def test_random_t_numbers_are_valid_unassignable_and_avoid_given_numbers():
    rng = random.Random(0)
    first = random_t_number(rng)
    assert is_valid_t_number(first) and is_unassignable(first) and first[2:6] == "9999"
    assert [check_digit("999900000001"), check_digit("999900000002")] == [8, 7]   # T8999900000001, T7999900000002
    rng = random.Random(0)
    assert random_t_number(rng, avoid={first[1:]}) != first


def test_phone_numbers_use_an_exchange_japan_never_assigns():
    assert unassigned_phone("3", 4321, 5678) == "03-0321-5678"
    assert unassigned_phone("45", 4321, 5678) == "045-021-5678"


def test_registered_names_are_swapped_without_spending_random_draws():
    def draws(registered):
        fac = EntityFactory("train", random.Random(3), set(), registered=registered)
        companies = [fac.company() for _ in range(40)]
        return companies, fac.rng.random(), fac.renamed
    plain, after_plain, _ = draws(None)
    swapped, after_swapped, renamed = draws(lambda name: "暁" in name)
    assert after_plain == after_swapped                      # same random stream afterwards
    assert renamed and all("暁" not in c.name for c in swapped)
    assert [c.t_number for c in plain] == [c.t_number for c in swapped]


def test_allocation_is_exact():
    for n in (100, 150, 600):
        assert sum(families.allocate(n).values()) == n


def test_p_safe_matches_ground_truth_on_one_hot_answers():
    labels = {"request_type": "routine_invoice", "new_destination": False, "pressure": True, "suspicion": 1}
    probs = {q: {k: float(k == (str(labels[q]).lower() if QUESTIONS[q]["type"] == "noul" else str(labels[q]))) for k in option_keys(q)} for q in QUESTIONS}
    assert is_safe(labels) and p_safe(probs) == 1.0
    probs["new_destination"] = {"false": 0.0, "true": 1.0}
    assert p_safe(probs) == 0.0


@pytest.fixture(scope="module")
def splits():
    used, out = set(), {}
    for split, n in build.SIZES.items():
        out[split] = build.build_split(split, n, 7, used, frozenset())
    return out


def test_splits_have_requested_sizes_and_valid_labels(splits):
    for split, (records, _) in splits.items():
        assert len(records) == build.SIZES[split]
        for r in records:
            for qid, q in r["questions"].items():
                keys = option_keys(qid)
                assert (str(q["label"]).lower() if q["type"] == "noul" else str(q["label"])) in keys


def test_test_split_shares_no_entities_or_templates_with_train(splits):
    records = {k: v[0] for k, v in splits.items()}
    logs = {k: v[1] for k, v in splits.items()}
    report = build.leakage.report(records, logs)
    assert all(v == 0 for v in report["entities_shared_with_train"]["test"].values())
    assert report["templates_shared_with_train"]["test"]["shared"] == 0
    assert report["exact_duplicate_states"] == {"val": 0, "test": 0}
    assert build.check(records, logs, None)["t_numbers_valid_and_unassignable"]
