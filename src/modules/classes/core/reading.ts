import { Temporal } from "temporal-polyfill";

// What the model reads from a class schedule, checked field by field. Code
// keeps only what holds and never guesses: a meeting without days and times
// that parse is dropped, not filled in.

export interface ReadClass {
  title: string;
  days: number[];
  start: string;
  end: string;
  place: string | null;
  from: string | null;
  until: string | null;
}

export interface CheckedClass {
  title: string;
  days: number[];
  start: string;
  minutes: number;
  place: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

const MAX_CLASSES = 30;
const clockOf = (text: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h < 24 && m < 60 ? h * 60 + m : null;
};
const dateOf = (text: string | null): string | null => {
  if (!text) return null;
  try {
    return Temporal.PlainDate.from(text.trim()).toString();
  } catch {
    return null;
  }
};
const tidy = (text: string | null, max: number) => {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  return line && line.length <= max ? line : null;
};

/** The meetings that hold, as they'll be saved. */
export function checkClasses(read: ReadClass[]): CheckedClass[] {
  const kept: CheckedClass[] = [];
  for (const c of read) {
    const title = tidy(c.title, 60);
    const days = [...new Set(c.days)].filter(
      (d) => Number.isInteger(d) && d >= 0 && d <= 6,
    );
    const start = clockOf(c.start);
    const end = clockOf(c.end);
    if (!title || !days.length || start === null || end === null) continue;
    const minutes = end - start;
    if (minutes < 10 || minutes > 360) continue;
    let [from, until] = [dateOf(c.from), dateOf(c.until)];
    if (from && until && from > until) [from, until] = [null, null];
    kept.push({
      title,
      days: days.sort((a, b) => a - b),
      start: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
      minutes,
      place: tidy(c.place, 60),
      starts_on: from,
      ends_on: until,
    });
    if (kept.length === MAX_CLASSES) break;
  }
  return kept;
}
