"""The NTA corporate registry (法人番号), used to keep every fictional identifier fictional.

Two sources, two jobs:
- the Tokyo bulk CSVs (`data/nta/raw`) are what the published split was *drawn* against: a drawn company name that is a
  registered Tokyo corporation is redrawn. Kept so the published split rebuilds byte for byte.
- the nationwide index (`data/nta/corporations.sqlite`, 5.79M corporations, open and closed) is what every *check* uses:
  a drawn name registered anywhere in Japan is swapped for a reserved stem (entities.EntityFactory), and the build fails
  if any company name or T-number in the output is registered.
"""
import csv
import logging
import sqlite3
import unicodedata
from pathlib import Path

log = logging.getLogger("payeebench.registry")


def name_key(name):
    """The index's `name_key`: the registered name, NFKC-normalised (full-width letters and digits folded)."""
    return unicodedata.normalize("NFKC", name)


def tokyo_sets(nta_dir):
    """(numbers, names) from the NTA Tokyo bulk CSVs, or two empty sets when the folder is absent."""
    numbers, names = set(), set()
    if not nta_dir or not Path(nta_dir).is_dir():
        return numbers, names
    for path in sorted(Path(nta_dir).glob("*.csv")):
        with path.open(encoding="utf-8", newline="") as f:
            for row in csv.reader(f):
                if len(row) > 6:
                    numbers.add(row[1]); names.add(row[6])
    log.info("NTA Tokyo files: %d numbers, %d names", len(numbers), len(names))
    return numbers, names


class Nationwide:
    """Read-only lookups in the nationwide index (indexed on number and name_key)."""

    def __init__(self, path):
        self.path = str(path)
        self.db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        self.size = self.db.execute("SELECT COUNT(*) FROM corporations").fetchone()[0]
        log.info("NTA nationwide index: %d corporations", self.size)

    def has_name(self, name):
        return self.db.execute("SELECT 1 FROM corporations WHERE name_key = ? LIMIT 1", (name_key(name),)).fetchone() is not None

    def registered_numbers(self, numbers):
        """The subset of 13-digit corporate numbers that belong to a registered corporation, with its name."""
        found = (self.db.execute("SELECT number, name FROM corporations WHERE number = ?", (n,)).fetchone() for n in sorted(set(numbers)))
        return [row for row in found if row]

    def registered_names(self, names):
        return sorted(n for n in set(names) if self.has_name(n))


def nationwide(path):
    """The nationwide index when the file exists, else None (checks are then reported as not run)."""
    if path and Path(path).is_file():
        return Nationwide(path)
    log.warning("no nationwide NTA index at %s: names and T-numbers are not checked against it", path)
    return None
