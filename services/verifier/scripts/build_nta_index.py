"""Builds data/nta/corporations.sqlite from the NTA 法人番号 bulk CSVs (Unicode).

Usage: [NTA_DB_OUT=path.sqlite] python3 services/verifier/scripts/build_nta_index.py data/nta/raw/*.csv

Column layout follows the NTA resource definition (リソース定義書): 30 columns per row.
Only the latest, displayable record for each corporate number is kept.
"""

import csv
import logging
import os
import sqlite3
import sys
import unicodedata
from pathlib import Path

DB_PATH = Path(os.environ.get("NTA_DB_OUT", "data/nta/corporations.sqlite"))
BATCH = 50_000

# 0-based column indexes in the NTA CSV.
COL = {
    "number": 1, "name": 6, "kind": 8, "pref": 9, "city": 10, "street": 11,
    "post_code": 15, "close_date": 18, "latest": 23, "en_name": 24, "furigana": 28, "hidden": 29,
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS corporations (
    number TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    kind TEXT,
    pref TEXT,
    city TEXT,
    street TEXT,
    post_code TEXT,
    close_date TEXT,
    en_name TEXT,
    furigana TEXT
);
"""


def name_key(name: str) -> str:
    """Normalisation used for exact matching: NFKC (full/half width) and whitespace removed."""
    return "".join(unicodedata.normalize("NFKC", name).split())


def to_record(row: list[str]) -> tuple | None:
    if len(row) < 30 or row[COL["latest"]] != "1" or row[COL["hidden"]] != "0":
        return None
    name = row[COL["name"]]
    return (
        row[COL["number"]], name, name_key(name), row[COL["kind"]], row[COL["pref"]],
        row[COL["city"]], row[COL["street"]], row[COL["post_code"]], row[COL["close_date"]],
        row[COL["en_name"]], row[COL["furigana"]],
    )


def load(db: sqlite3.Connection, csv_path: Path) -> int:
    count, batch = 0, []
    with csv_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.reader(handle):
            record = to_record(row)
            if record is None:
                continue
            batch.append(record)
            if len(batch) >= BATCH:
                count += flush(db, batch)
    return count + flush(db, batch)


def flush(db: sqlite3.Connection, batch: list[tuple]) -> int:
    db.executemany("INSERT OR REPLACE INTO corporations VALUES (?,?,?,?,?,?,?,?,?,?,?)", batch)
    db.commit()
    written = len(batch)
    batch.clear()
    return written


def main(paths: list[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if not paths:
        raise SystemExit("usage: build_nta_index.py <csv> [<csv> ...]")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    total = 0
    for path in paths:
        written = load(db, Path(path))
        logging.info("%s: %d rows", path, written)
        total += written
    db.execute("CREATE INDEX IF NOT EXISTS idx_name_key ON corporations(name_key)")
    db.commit()
    db.execute("VACUUM")
    db.close()
    logging.info("indexed %d corporations into %s", total, DB_PATH)


if __name__ == "__main__":
    main(sys.argv[1:])
