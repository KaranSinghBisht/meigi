"""An LLM contender: Claude Haiku with structured output, asked for a probability for every option of every question.
Stated probabilities are what an LLM-with-JSON integration would threshold on; they are not logits."""
import json
import time

from .env import secret
from .providers import Prediction, ProviderUnavailable, normalise
from .schema import QUESTIONS, option_keys

HAIKU = "claude-haiku-4-5"
USD_PER_M = {HAIKU: (1.0, 5.0)}      # input, output list price per million tokens

SYSTEM = """You triage items for the AI accounts-payable agent of a Japanese company: invoices (適格請求書), vendor e-mails,
executive messages and x402 payment-required responses. `payee_on_file` is the vendor master record, when the agent has one.
Answer every question below about the item. For each question give a probability for every option; the probabilities of
one question sum to 1 and should say how sure you are. For yes/no questions give the probability of yes.

"""


def render_state(state, indent=0):
    """The item as labelled text, the way Kev renders object states (field names kept)."""
    pad = "  " * indent
    if isinstance(state, dict):
        return "\n".join(f"{pad}{k}:\n{render_state(v, indent + 1)}" if isinstance(v, (dict, list)) else f"{pad}{k}: {v}" for k, v in state.items())
    if isinstance(state, list):
        return "\n".join(f"{pad}- {render_state(v, indent + 1).lstrip()}" for v in state)
    return f"{pad}{state}"


def question_text():
    lines = []
    for qid, q in QUESTIONS.items():
        lines.append(f"- {qid} ({q['type']}): {q['instructions']}")
        if q["type"] == "choice":
            lines += [f"    {k}: {v}" for k, v in q["criteria"].items()]
        elif q["type"] == "score":
            lines += [f"    {i}: {v}" for i, v in enumerate(q["criteria"])]
    return "\n".join(lines)


def output_schema():
    def dist(keys):
        return {"type": "object", "properties": {k: {"type": "number"} for k in keys}, "required": keys, "additionalProperties": False}
    props = {qid: dist(option_keys(qid)) if q["type"] != "noul" else {"type": "number"} for qid, q in QUESTIONS.items()}
    return {"type": "object", "properties": props, "required": list(QUESTIONS), "additionalProperties": False}


def to_probs(data):
    out = {}
    for qid, q in QUESTIONS.items():
        if q["type"] == "noul":
            p = min(1.0, max(0.0, float(data[qid])))
            out[qid] = {"false": 1.0 - p, "true": p}
        else:
            out[qid] = normalise(data[qid], option_keys(qid))
    return out


class ClaudeLLM:
    def __init__(self, name="claude-haiku-4.5", model=HAIKU):
        self.name, self.model, self.client = name, model, None

    def _client(self):
        if self.client is None:
            if not secret("ANTHROPIC_API_KEY"):
                raise ProviderUnavailable("ANTHROPIC_API_KEY not set")
            import anthropic
            self.client = anthropic.Anthropic(api_key=secret("ANTHROPIC_API_KEY"), max_retries=4)
        return self.client

    def __call__(self, state):
        client = self._client()
        import anthropic
        started = time.perf_counter()
        try:
            response = client.messages.create(
                model=self.model, max_tokens=512, system=SYSTEM + question_text(),
                messages=[{"role": "user", "content": render_state(state)}],
                output_config={"format": {"type": "json_schema", "schema": output_schema()}})
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.NotFoundError) as e:
            raise ProviderUnavailable(f"Anthropic API refused the key or model: {type(e).__name__}") from e
        wall = 1000 * (time.perf_counter() - started)
        text = next(b.text for b in response.content if b.type == "text")
        usage = response.usage
        price_in, price_out = USD_PER_M[self.model]
        cost = (usage.input_tokens * price_in + usage.output_tokens * price_out) / 1e6
        return Prediction(to_probs(json.loads(text)), wall, None, usage.input_tokens, usage.output_tokens, cost)
