"""Contenders: anything that answers the System-1 question set for a state.

SystemOne       any TypeSafe /v1/systemone-compatible endpoint (local kev.serve, TypeSafe's API, a deployed Kev), and
                OpenRouter's Decisions endpoint (/api/alpha/decisions: same body plus `model`, same answers)
CloudflareJev   Jev through the Cloudflare REST API (`typesafe/jev`)
ClaudeLLM       an LLM with structured output (Claude Haiku), asked for a probability per option

Each returns a Prediction with probabilities keyed like schema.option_keys. Missing credentials, missing credit (HTTP
402) or an unreachable endpoint raise ProviderUnavailable, which the harness records as a skipped contender."""
import json
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from .env import secret
from .schema import QUESTION_IDS, QUESTIONS, option_keys, request_body

log = logging.getLogger("payeebench.providers")
JEV_USD_PER_M_INPUT = 0.042          # TypeSafe list price; output tokens are free
RETRYABLE = {408, 409, 429, 500, 502, 503, 504, 529}


class ProviderUnavailable(Exception):
    """The contender cannot be run here (no key, no credit, endpoint down). Not a model error."""


@dataclass
class Prediction:
    probs: dict                      # qid -> {option key: probability}
    latency_ms: float                # client wall clock, network included
    server_ms: float | None = None   # model time reported by the server, when it reports one
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None


def normalise(raw, keys):
    missing = set(keys) - set(raw)
    if missing:
        raise ValueError(f"answer lacks options {sorted(missing)}")
    values = [max(0.0, float(raw[k])) for k in keys]
    total = sum(values)
    if total <= 0:
        raise ValueError("answer probabilities sum to zero")
    return {k: v / total for k, v in zip(keys, values)}


def parse_answers(answers):
    """TypeSafe answer objects -> probabilities per question (noul: p(true); choice/score: `probabilities`)."""
    out = {}
    for qid in QUESTION_IDS:
        a = answers[qid]
        if QUESTIONS[qid]["type"] == "noul":
            p = float(a["noul"] if "noul" in a else a["probability"])
            out[qid] = {"false": 1.0 - p, "true": p}
        else:
            out[qid] = normalise({str(k): v for k, v in a["probabilities"].items()}, option_keys(qid))
    return out


def post_json(url, body, headers, timeout=60, attempts=4):
    """-> (parsed JSON, wall ms). 401/402/403/404 raise ProviderUnavailable; 429/5xx retry with backoff."""
    data = json.dumps(body, ensure_ascii=False).encode()
    for attempt in range(attempts):
        req = urllib.request.Request(url, data=data, method="POST", headers={"content-type": "application/json", **headers})
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read())
            return payload, 1000 * (time.perf_counter() - started)
        except urllib.error.HTTPError as e:
            detail = e.read()[:300].decode(errors="replace")
            if e.code in (401, 402, 403, 404):
                raise ProviderUnavailable(f"HTTP {e.code} from {url.split('/')[2]}: {detail}") from e
            if e.code not in RETRYABLE or attempt == attempts - 1:
                raise RuntimeError(f"HTTP {e.code} from {url.split('/')[2]}: {detail}") from e
        except urllib.error.URLError as e:
            if attempt == attempts - 1:
                raise ProviderUnavailable(f"{url.split('/')[2]} unreachable: {e.reason}") from e
        time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


class SystemOne:
    """POST <base_url>/v1/systemone. `energy_watts` prices a local server by electricity (see costs.py);
    `usd_per_m_input` prices a hosted one by input tokens (Jev's list price)."""

    def __init__(self, name, base_url, api_key=None, model="kev-latest", usd_per_m_input=None, energy=None, path="/v1/systemone"):
        self.name, self.base_url, self.api_key, self.model = name, base_url.rstrip("/"), api_key, model
        self.usd_per_m_input, self.energy, self.path = usd_per_m_input, energy, path

    def __call__(self, state):
        headers = {"authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        body, wall = post_json(f"{self.base_url}{self.path}", {**request_body(state), "model": self.model}, headers)
        usage = body.get("usage") or {}
        pred = Prediction(parse_answers(body["answers"]), wall, body.get("latency_ms"), usage.get("input_tokens"), usage.get("output_tokens"))
        if usage.get("cost") is not None:
            pred.cost_usd = float(usage["cost"])
        elif self.usd_per_m_input is not None and pred.input_tokens is not None:
            pred.cost_usd = pred.input_tokens * self.usd_per_m_input / 1e6
        elif self.energy is not None:
            pred.cost_usd = self.energy.usd(wall)
        return pred


class CloudflareJev:
    """Jev on Cloudflare Workers AI through the REST API: POST .../accounts/<id>/ai/run {model, input}."""

    def __init__(self, name="jev (cloudflare)"):
        self.name = name
        self.account, self.token = secret("CLOUDFLARE_ACCOUNT_ID"), secret("CLOUDFLARE_API_TOKEN")

    def __call__(self, state):
        if not (self.account and self.token):
            raise ProviderUnavailable("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set")
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account}/ai/run"
        body, wall = post_json(url, {"model": "typesafe/jev", "input": request_body(state)}, {"authorization": f"Bearer {self.token}"})
        result = body.get("result", body)
        usage = result.get("usage") or {}
        tokens = usage.get("input_tokens")
        return Prediction(parse_answers(result["answers"]), wall, None, tokens, usage.get("output_tokens"),
                          tokens * JEV_USD_PER_M_INPUT / 1e6 if tokens is not None else None)


def openrouter_jev(name="jev (openrouter)"):
    """Jev through OpenRouter's Decisions endpoint, POST /api/alpha/decisions {model, state, questions}; the response
    carries TypeSafe-shaped answers and usage.cost in USD (prepaid credit required)."""
    key = secret("OPENROUTER_API_KEY")
    jev = SystemOne(name, "https://openrouter.ai/api", key, "~typesafe/jev-latest", JEV_USD_PER_M_INPUT, path="/alpha/decisions")
    return _keyed(jev, key, "OPENROUTER_API_KEY")


def typesafe_jev(name="jev (typesafe)"):
    key = secret("TYPESAFE_API_KEY")
    return _keyed(SystemOne(name, "https://api.typesafe.ai", key, "jev-latest", JEV_USD_PER_M_INPUT), key, "TYPESAFE_API_KEY")


class _Missing:
    def __init__(self, name, variable):
        self.name, self.variable = name, variable

    def __call__(self, state):
        raise ProviderUnavailable(f"{self.variable} not set")


def _keyed(provider, key, variable):
    return provider if key else _Missing(provider.name, variable)
