import { Temporal } from "temporal-polyfill";
import type { Zoned } from "@/lib/time";

// The student's classes: weekly meetings read from the schedule they uploaded
// (see read.ts), kept as rules, not copies. Code turns a rule into the times
// it meets on any day, in the student's time zone, so every week shows them
// and the planner, the walks and hand-set times keep clear of them.

export interface ClassRule {
  id: string;
  title: string;
  days: number[]; // 0 = Sunday … 6 = Saturday
  start: string; // "HH:MM", local
  minutes: number;
  place: string | null;
  starts_on: string | null; // the term's first day, when the schedule shows it
  ends_on: string | null; // and its last
}

export interface ClassTime {
  key: string;
  rule: ClassRule;
  start: Zoned;
  end: Zoned;
}

const weekday = (date: Temporal.PlainDate) => date.dayOfWeek % 7;

/** The classes that meet on `date`, earliest first. */
export function classesOn(
  rules: ClassRule[],
  date: Temporal.PlainDate,
  tz: string,
): ClassTime[] {
  const day = date.toString();
  return rules
    .filter(
      (r) =>
        r.days.includes(weekday(date)) &&
        (!r.starts_on || r.starts_on <= day) &&
        (!r.ends_on || day <= r.ends_on),
    )
    .map((rule) => {
      const start = date.toZonedDateTime({
        timeZone: tz,
        plainTime: Temporal.PlainTime.from(rule.start),
      });
      return {
        key: `class-${rule.id}-${day}`,
        rule,
        start,
        end: start.add({ minutes: rule.minutes }),
      };
    })
    .sort((a, b) => a.start.epochMilliseconds - b.start.epochMilliseconds);
}

/** Every class meeting that overlaps `from` to `to`. */
export function classTimes(
  rules: ClassRule[],
  from: Zoned,
  to: Zoned,
): ClassTime[] {
  const tz = from.timeZoneId;
  const times: ClassTime[] = [];
  for (
    let date = from.toPlainDate();
    Temporal.PlainDate.compare(date, to.toPlainDate()) <= 0;
    date = date.add({ days: 1 })
  )
    for (const time of classesOn(rules, date, tz))
      if (
        time.start.epochMilliseconds < to.epochMilliseconds &&
        time.end.epochMilliseconds > from.epochMilliseconds
      )
        times.push(time);
  return times;
}

/** "Mon Wed", for a list of weekdays. */
export function daysText(days: number[]): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => names[d])
    .join(" ");
}
