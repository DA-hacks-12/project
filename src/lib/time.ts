import { Temporal } from "temporal-polyfill";

// Code owns time: every clock and calendar step happens here, in the
// student's time zone, never in the model.

export type Zoned = Temporal.ZonedDateTime;

export function zoned(at: Date | string, tz: string): Zoned {
  const instant = Temporal.Instant.from(
    typeof at === "string" ? at : at.toISOString(),
  );
  return instant.toZonedDateTimeISO(tz);
}

export function iso(at: Zoned): string {
  return at.toInstant().toString();
}

export function minutesBetween(from: Zoned, to: Zoned): number {
  return Math.round((to.epochMilliseconds - from.epochMilliseconds) / 60_000);
}

export function addMinutes(at: Zoned, minutes: number): Zoned {
  return at.add({ minutes });
}

/** The next whole step (15 minutes by default) at or after `at`. */
export function nextStep(at: Zoned, step = 15): Zoned {
  const whole = at.round({ smallestUnit: "minute", roundingMode: "ceil" });
  const over = whole.minute % step;
  return over ? whole.add({ minutes: step - over }) : whole;
}

/** "HH:MM" on the day of `day`, or null when it isn't a clock time. */
export function atClock(day: Zoned, text: string): Zoned | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return day.startOfDay().with({ hour, minute });
}

export function hhmm(at: Zoned): string {
  return `${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`;
}

/** "3:30pm" */
export function clock(at: Zoned): string {
  const hour = at.hour % 12 || 12;
  return `${hour}:${String(at.minute).padStart(2, "0")}${at.hour < 12 ? "am" : "pm"}`;
}

/** "5:20–6:00pm"; the first am/pm only when they differ ("11:30am–12:15pm"). */
export function clockRange(start: Zoned, end: Zoned): string {
  const sameHalf = start.hour < 12 === end.hour < 12;
  return `${sameHalf ? clock(start).slice(0, -2) : clock(start)}–${clock(end)}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function weekday(at: Zoned): string {
  return WEEKDAYS[at.dayOfWeek - 1];
}

/** "Sun Oct 18" */
export function shortDate(at: Zoned): string {
  return `${weekday(at)} ${MONTHS[at.month - 1]} ${at.day}`;
}
