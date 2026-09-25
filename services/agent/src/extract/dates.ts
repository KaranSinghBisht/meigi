/** Due dates: 2026年10月31日, 令和8年10月31日, 2026/10/31, 2026-10-31, October 31, 2026, 31 Oct 2026. */

const DUE_LABEL =
  /(?:お?支払(?:い)?期(?:限|日)|お?振込期(?:限|日)|支払(?:予定)?日|期日|due\s+date|payment\s+due|pay\s+by|due\s+by|due\s+on|due)\s*(?:[:：]\s*)?/iu;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAME = String.raw`(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?`;

const REIWA = /(?:令和|R)\s*(元|\d{1,2})\s*[年./]\s*(\d{1,2})\s*[月./]\s*(\d{1,2})/u;
const NUMERIC = /(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/u;
const MONTH_FIRST = new RegExp(String.raw`${MONTH_NAME}\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`, "iu");
const DAY_FIRST = new RegExp(String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH_NAME},?\s+(\d{4})`, "iu");

/** The first labelled due date, as yyyy-mm-dd, or null. Unlabelled dates are never guessed to be due dates. */
export function findDueDate(text: string): string | null {
  for (const line of text.split("\n")) {
    const label = DUE_LABEL.exec(line);
    if (!label) continue;
    const date = parseDate(line.slice(label.index + label[0].length, label.index + label[0].length + 40));
    if (date) return date;
  }
  return null;
}

/** Parses the first date in `text`. */
export function parseDate(text: string): string | null {
  const reiwa = REIWA.exec(text);
  if (reiwa) return iso(2018 + (reiwa[1] === "元" ? 1 : Number(reiwa[1])), Number(reiwa[2]), Number(reiwa[3]));
  const numeric = NUMERIC.exec(text);
  if (numeric) return iso(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  const monthFirst = MONTH_FIRST.exec(text);
  if (monthFirst) return iso(Number(monthFirst[3]), monthIndex(monthFirst[1]!), Number(monthFirst[2]));
  const dayFirst = DAY_FIRST.exec(text);
  if (dayFirst) return iso(Number(dayFirst[3]), monthIndex(dayFirst[2]!), Number(dayFirst[1]));
  return null;
}

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

/** yyyy-mm-dd, or null for impossible dates such as 2026-02-30. */
function iso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, 10) : null;
}
