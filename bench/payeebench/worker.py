"""Contenders behind Meigi's own Cloudflare Worker (workers/ai-proxy), authenticated with AI_PROXY_TOKEN:

    POST $AI_PROXY_URL/v1/systemone  {state, questions}          -> Jev's native answer (AI Gateway credit)
    POST $AI_PROXY_URL/v1/chat       {messages, max_tokens, temperature} -> Workers AI Llama 3.3 70B

Jev skips cleanly while the account has no credit (the Worker answers 402 insufficient_credits). Llama gets no schema
enforcement through the Worker, so it is prompted for JSON and parsed defensively; an unparseable answer is scored as a
uniform distribution and counted in `parse_error`."""
import json
import re

from .env import secret
from .llm import SYSTEM, question_text, render_state, to_probs
from .providers import JEV_USD_PER_M_INPUT, Prediction, ProviderUnavailable, SystemOne, post_json
from .schema import QUESTIONS, option_keys

LLAMA_USD_PER_M = (0.293, 2.253)      # Workers AI list price for llama-3.3-70b-instruct-fp8-fast (input, output)
JSON_OBJECT = re.compile(r"\{.*\}", re.S)
TOP_UP = "top up Cloudflare AI Gateway credit, then run `uv run python -m payeebench.evaluate --remote jev-worker`"


def _endpoint():
    url, token = secret("AI_PROXY_URL"), secret("AI_PROXY_TOKEN")
    if not (url and token):
        raise ProviderUnavailable("AI_PROXY_URL / AI_PROXY_TOKEN not set")
    return url.rstrip("/"), token


class WorkerJev(SystemOne):
    """Jev through the Worker: the TypeSafe body without `model`, priced at Jev's list price per input token."""
    warmup = 1

    def __init__(self, name="jev (worker)"):
        super().__init__(name, "", None, model=None, usd_per_m_input=JEV_USD_PER_M_INPUT)

    def __call__(self, state):
        self.base_url, self.api_key = _endpoint()
        try:
            return super().__call__(state)
        except ProviderUnavailable as e:
            if "HTTP 402" in str(e):
                raise ProviderUnavailable(f"Worker returned 402 insufficient_credits: {TOP_UP}") from e
            raise


def _format_hint():
    skeleton = {qid: ({k: 0.0 for k in option_keys(qid)} if q["type"] != "noul" else 0.0) for qid, q in QUESTIONS.items()}
    return ("\n\nReply with one JSON object and nothing else, shaped exactly like this (numbers are probabilities):\n"
            + json.dumps(skeleton, ensure_ascii=False))


def parse_json_answer(text):
    """Probabilities from the model's reply, or None when it holds no usable JSON object."""
    if isinstance(text, dict):
        data = text
    else:
        match = JSON_OBJECT.search(text or "")
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    try:
        return to_probs(data)
    except (KeyError, TypeError, ValueError):
        return None


def uniform():
    return {qid: {k: 1 / len(option_keys(qid)) for k in option_keys(qid)} for qid in QUESTIONS}


class WorkerLlama:
    """Llama 3.3 70B asked for a probability per option, as an LLM-with-structured-output contender. Test split only:
    it spends the Worker's shared Workers AI allowance."""
    splits, warmup, kind = ("test",), 1, "llm"

    def __init__(self, name="llama-3.3-70b (worker)"):
        self.name = name

    def __call__(self, state):
        url, token = _endpoint()
        body = {"messages": [{"role": "system", "content": SYSTEM + question_text() + _format_hint()},
                             {"role": "user", "content": render_state(state)}], "max_tokens": 300, "temperature": 0}
        reply, wall = post_json(f"{url}/v1/chat", body, {"authorization": f"Bearer {token}"}, timeout=120)
        text = reply["choices"][0]["message"]["content"] if "choices" in reply else reply.get("response")
        probs = parse_json_answer(text)
        usage = reply.get("usage") or {}
        tokens_in, tokens_out = usage.get("prompt_tokens"), usage.get("completion_tokens")
        cost = (tokens_in * LLAMA_USD_PER_M[0] + tokens_out * LLAMA_USD_PER_M[1]) / 1e6 if tokens_in is not None and tokens_out is not None else None
        return Prediction(probs or uniform(), wall, None, tokens_in, tokens_out, cost, parse_error=probs is None)
