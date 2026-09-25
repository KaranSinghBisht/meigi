import pytest

from payeebench import providers
from payeebench.llm import ClaudeLLM, output_schema, to_probs
from payeebench.providers import CloudflareJev, ProviderUnavailable, SystemOne, parse_answers

ANSWERS = {
    "request_type": {"type": "choice", "choice": "payee_change", "confidence": 0.6,
                     "probabilities": {"routine_invoice": 0.1, "payee_change": 0.7, "urgent_exec_request": 0.1, "credit_note": 0.05, "other": 0.05}},
    "new_destination": {"type": "noul", "noul": 0.9},
    "pressure": {"type": "noul", "noul": 0.2},
    "suspicion": {"type": "score", "score": 2.1, "probabilities": {"0": 0.1, "1": 0.1, "2": 0.4, "3": 0.4}},
}


def test_parse_answers_normalises_every_question():
    probs = parse_answers(ANSWERS)
    assert probs["new_destination"] == {"false": pytest.approx(0.1), "true": 0.9}
    assert sum(probs["suspicion"].values()) == pytest.approx(1.0)


def test_systemone_prices_hosted_calls_by_input_tokens(monkeypatch):
    monkeypatch.setattr(providers, "post_json", lambda url, body, headers: ({"answers": ANSWERS, "usage": {"input_tokens": 1000}}, 12.0))
    pred = SystemOne("jev", "https://example.invalid", "key", "jev-latest", usd_per_m_input=0.042)({"body": "x"})
    assert pred.cost_usd == pytest.approx(0.042 / 1000) and pred.latency_ms == 12.0


def test_cloudflare_unwraps_result_and_skips_without_credentials(monkeypatch):
    monkeypatch.setattr(providers, "secret", lambda name: None)
    with pytest.raises(ProviderUnavailable):
        CloudflareJev()({"body": "x"})
    monkeypatch.setattr(providers, "secret", lambda name: "set")
    monkeypatch.setattr(providers, "post_json", lambda url, body, headers: ({"result": {"answers": ANSWERS, "usage": {"input_tokens": 500}}, "success": True}, 30.0))
    pred = CloudflareJev()({"body": "x"})
    assert pred.probs["request_type"]["payee_change"] == pytest.approx(0.7)


def test_llm_schema_round_trip_and_missing_key(monkeypatch):
    schema = output_schema()
    assert set(schema["required"]) == set(ANSWERS)
    data = {"request_type": {"routine_invoice": 1, "payee_change": 3, "urgent_exec_request": 0, "credit_note": 0, "other": 0},
            "new_destination": 0.8, "pressure": 0.1, "suspicion": {"0": 0, "1": 1, "2": 1, "3": 2}}
    assert to_probs(data)["request_type"]["payee_change"] == pytest.approx(0.75)
    monkeypatch.setattr("payeebench.llm.secret", lambda name: None)
    with pytest.raises(ProviderUnavailable):
        ClaudeLLM()({"body": "x"})
