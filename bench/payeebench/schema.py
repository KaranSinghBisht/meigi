"""The System-1 question set Meigi sends with every invoice, email and x402 response, and the derived
"safe to auto-clear" decision. These strings are the production strings: the fine-tune binds them, so change
them here and nowhere else."""

REQUEST_TYPES = {
    "routine_invoice": "A normal invoice, bill, payment reminder or x402 payment-required response for goods or services",
    "payee_change": "A message that announces or asks for a change of bank account, wallet address or payee",
    "urgent_exec_request": "An executive, manager or other authority figure asks for a special, urgent or confidential payment",
    "credit_note": "A credit note, refund, return or discount that reduces the amount owed",
    "other": "Anything else, such as notices, receipts, newsletters or meeting requests",
}

SUSPICION_LEVELS = [
    "Clearly benign: routine business, nothing unusual",
    "Some unusual elements, but probably legitimate",
    "Suspicious: red flags that need verification before paying",
    "Very likely a payment-redirection scam",
]

QUESTIONS = {
    "request_type": {
        "type": "choice",
        "instructions": "What kind of payment request is this?",
        "criteria": REQUEST_TYPES,
    },
    "new_destination": {
        "type": "noul",
        "instructions": "Does it ask to pay a bank account or wallet address that is new or different from the one on file or used before?",
    },
    "pressure": {
        "type": "noul",
        "instructions": "Does it use urgency, secrecy or authority to push for a fast payment or to skip the usual checks?",
    },
    "suspicion": {
        "type": "score",
        "instructions": "How likely is this to be a payment-redirection scam?",
        "criteria": SUSPICION_LEVELS,
    },
}

QUESTION_IDS = tuple(QUESTIONS)
SAFE_TYPES = ("routine_invoice", "credit_note")
MAX_SAFE_SUSPICION = 1


def option_keys(qid):
    """Answer keys in option order: choice names, ["false", "true"] for noul, level indices as strings for score."""
    q = QUESTIONS[qid]
    if q["type"] == "choice":
        return list(q["criteria"])
    if q["type"] == "noul":
        return ["false", "true"]
    return [str(i) for i in range(len(q["criteria"]))]


def label_key(qid, label):
    """A label as its answer key: option name, "true"/"false", or the level index as a string."""
    if QUESTIONS[qid]["type"] == "noul":
        return "true" if label else "false"
    return str(label)


def labelled_questions(labels):
    """The request's questions with a Kev training `label` on each (Kev's JSONL format)."""
    return {qid: {**q, "label": labels[qid]} for qid, q in QUESTIONS.items()}


def request_body(state):
    """The /v1/systemone body for a state: what leaves the machine (never labels or metadata)."""
    return {"state": state, "questions": QUESTIONS}


def is_safe(labels):
    """Ground truth for "safe to auto-clear": an ordinary bill or credit, same destination, at most mildly unusual."""
    return (labels["request_type"] in SAFE_TYPES and not labels["new_destination"]
            and labels["suspicion"] <= MAX_SAFE_SUSPICION)


def p_safe(probs):
    """A model's probability that an item is safe to auto-clear, from its four answers:
    P(type is routine or credit) x P(no new destination) x P(suspicion <= 1). Pressure alone never blocks a clear:
    a legitimate overdue reminder is urgent, and the kernel still checks the payee."""
    p_type = sum(probs["request_type"][k] for k in SAFE_TYPES)
    p_same = probs["new_destination"]["false"]
    p_low = sum(probs["suspicion"][str(i)] for i in range(MAX_SAFE_SUSPICION + 1))
    return p_type * p_same * p_low
