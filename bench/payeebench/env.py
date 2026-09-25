"""Credentials come from the process environment, then from meigi/.env (git-ignored). Values are never logged."""
import os
from pathlib import Path

DOTENV = Path(__file__).resolve().parents[2] / ".env"


def _dotenv(path=DOTENV):
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip().removeprefix("export ").strip()] = value.strip().strip("'\"")
    return values


def secret(name):
    """The value of `name` from the environment or meigi/.env, or None when unset or empty."""
    return os.environ.get(name) or _dotenv().get(name) or None
