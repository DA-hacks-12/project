import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { Temporal } from "temporal-polyfill";

// Canvas calendar feed → upcoming assignments.
//
// Canvas writes one event per assignment, with a UID like `event-assignment-123`
// (`event-assignment-override-…` for an extension, `event-sub-assignment-…` for a
// discussion checkpoint) and the course code in brackets at the end of the title.
// An assignment due at 11:59pm is written as an all-day date with no time, so the
// due time is put back here. Class meetings and personal events are skipped.

const ASSIGNMENT_UID = /^event-[a-z-]*assignment[a-z-]*-\d+$/;
const COURSE_CODE = /\s*\[([^[\]]+)\]$/;

export interface Assignment {
  uid: string;
  title: string;
  course: string | null;
  due: string; // ISO instant
  text: string;
  url: string | null;
}

export function parseFeed(ics: string, tz: string, now: Date): Assignment[] {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const assignments: Assignment[] = [];
  for (const event of calendar.getAllSubcomponents("vevent")) {
    const uid = String(event.getFirstPropertyValue("uid") ?? "");
    const start = event.getFirstPropertyValue("dtstart");
    if (!ASSIGNMENT_UID.test(uid) || !(start instanceof ICAL.Time)) continue;
    const due = dueOf(start, tz);
    if (due.getTime() < now.getTime()) continue;
    const [title, course] = splitTitle(
      String(event.getFirstPropertyValue("summary") ?? ""),
    );
    assignments.push({
      uid,
      title,
      course,
      due: due.toISOString(),
      text: String(event.getFirstPropertyValue("description") ?? "").trim(),
      url: link(String(event.getFirstPropertyValue("url") ?? "")),
    });
  }
  return assignments.sort(
    (a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title),
  );
}

function dueOf(start: ICAL.Time, tz: string): Date {
  if (!start.isDate) return start.toJSDate();
  const date = Temporal.PlainDate.from({
    year: start.year,
    month: start.month,
    day: start.day,
  });
  const due = date.toZonedDateTime({
    timeZone: tz,
    plainTime: Temporal.PlainTime.from("23:59"),
  });
  return new Date(due.epochMilliseconds);
}

function splitTitle(summary: string): [string, string | null] {
  const match = COURSE_CODE.exec(summary);
  if (!match) return [summary.trim(), null];
  return [summary.slice(0, match.index).trim(), match[1].trim()];
}

/** The assignment's own page, rebuilt from the calendar link Canvas gives. */
function link(calendarUrl: string): string | null {
  if (!calendarUrl) return null;
  try {
    const url = new URL(calendarUrl);
    const context = url.searchParams.get("include_contexts") ?? "";
    const fragment = url.hash.slice(1);
    if (context.startsWith("course_") && fragment.startsWith("assignment_")) {
      return `https://${url.host}/courses/${context.slice(7)}/assignments/${fragment.slice(11)}`;
    }
    return calendarUrl;
  } catch {
    return null;
  }
}

/** The school's Canvas address, from the assignment links ("deanza.instructure.com"). */
export function schoolOf(assignments: Assignment[]): string | null {
  for (const a of assignments) {
    if (!a.url) continue;
    try {
      return new URL(a.url).host;
    } catch {}
  }
  return null;
}

/** What an assignment's reading depends on: read again only when this changes. */
export function fingerprint(
  a: Pick<Assignment, "course" | "title" | "text">,
): string {
  return createHash("sha256")
    .update(`${a.course}\n${a.title}\n${a.text}`)
    .digest("hex")
    .slice(0, 16);
}
