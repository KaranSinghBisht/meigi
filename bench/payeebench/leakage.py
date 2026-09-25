"""Leakage guards between splits: entity disjointness, template/phrase disjointness, shared sentences, and the
nearest-neighbour character n-gram similarity of every test item to the training set (compared with validation,
which shares training templates on purpose)."""
import json
import re

import numpy as np

DIGITS = re.compile(r"\d")
SENTENCE = re.compile(r"[。\n.!?！？]+")


def flat_text(state):
    """The text a model reads, without the field names (which every item shares)."""
    if isinstance(state, dict):
        return "\n".join(flat_text(v) for v in state.values())
    return str(state)


def normalise(text):
    return DIGITS.sub("0", text)


def sentences(text, min_len=15):
    return {s.strip() for s in SENTENCE.split(normalise(text)) if len(s.strip()) >= min_len}


def picks(signature):
    """Phrase-pool picks of an e-mail signature, or the layout id of a document ("invoice.ja_formal")."""
    head, _, rest = signature.partition("|")
    return set(rest.split(",")) if rest else {head}


def ngram_set(text, n=5):
    t = normalise(text)
    return {t[i:i + n] for i in range(max(1, len(t) - n + 1))}


def nearest_similarity(queries, corpus):
    """For each query text, the highest Jaccard similarity of its character 5-grams to any corpus text."""
    corpus_sets = [ngram_set(t) for t in corpus]
    out = []
    for q in queries:
        qs = ngram_set(q)
        out.append(max(len(qs & c) / len(qs | c) for c in corpus_sets))
    return np.asarray(out)


def _summary(values):
    return {"mean": round(float(values.mean()), 3), "p95": round(float(np.percentile(values, 95)), 3), "max": round(float(values.max()), 3)}


def report(splits, logs):
    """splits: {name: [records]}; logs: {name: EntityFactory.log}. -> dict written to dataset/leakage.json."""
    train_text = [flat_text(r["state"]) for r in splits["train"]]
    out = {"entities_shared_with_train": {}, "templates_shared_with_train": {}, "sentences_shared_with_train": {}, "nearest_train_5gram_jaccard": {}}
    train_picks = set().union(*(picks(r["_meta"]["template"]) for r in splits["train"]))
    train_sents = set().union(*(sentences(t) for t in train_text))
    for name in ("val", "test"):
        texts = [flat_text(r["state"]) for r in splits[name]]
        out["entities_shared_with_train"][name] = {k: len(logs[name][k] & logs["train"][k]) for k in sorted(logs[name])}
        split_picks = set().union(*(picks(r["_meta"]["template"]) for r in splits[name]))
        out["templates_shared_with_train"][name] = {"picks": len(split_picks), "shared": len(split_picks & train_picks)}
        split_sents = [sentences(t) for t in texts]
        shared = sum(len(s & train_sents) for s in split_sents)
        out["sentences_shared_with_train"][name] = {"sentences": sum(map(len, split_sents)), "shared": shared}
        out["nearest_train_5gram_jaccard"][name] = _summary(nearest_similarity(texts, train_text))
    exact = {json.dumps(r["state"], sort_keys=True, ensure_ascii=False) for r in splits["train"]}
    out["exact_duplicate_states"] = {n: sum(json.dumps(r["state"], sort_keys=True, ensure_ascii=False) in exact for r in splits[n]) for n in ("val", "test")}
    return out
