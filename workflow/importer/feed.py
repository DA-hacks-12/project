"""Canvas calendar feed → upcoming assignments.

Canvas writes one event per assignment, with a UID like `event-assignment-123`
(`event-assignment-override-…` for an extension, `event-sub-assignment-…` for a
discussion checkpoint) and the course code in brackets at the end of the title.
An assignment due at 11:59pm is written as an all-day date with no time, so the
due time is put back here. Class meetings and personal events are skipped.
"""

from __future__ import annotations

import re
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, time, tzinfo
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from icalendar import Calendar

ASSIGNMENT_UID = re.compile(r"^event-[a-z-]*assignment[a-z-]*-\d+$")
COURSE_CODE = re.compile(r"\s*\[([^\[\]]+)\]$")
ALL_DAY_DUE = time(23, 59)


@dataclass(frozen=True)
class Assignment:
    uid: str
    title: str
    course: str | None
    due: datetime
    text: str
    url: str | None


def read(source: str) -> str:
    """The feed's text, from a Canvas feed link or a saved .ics file."""
    if source.startswith("webcal://"):
        source = "https://" + source.removeprefix("webcal://")
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=30) as response:
            return response.read().decode("utf-8")
    return Path(source).expanduser().read_text(encoding="utf-8")


def parse(ics: str, tz: tzinfo, now: datetime) -> list[Assignment]:
    """Assignments not yet due, soonest first. `tz` is the student's time zone."""
    assignments = []
    for event in Calendar.from_ical(ics).events:
        uid = str(event.get("UID", ""))
        if not ASSIGNMENT_UID.match(uid) or "DTSTART" not in event:
            continue
        due = _due(event.start, tz)
        if due < now:
            continue
        title, course = _split_title(str(event.get("SUMMARY", "")))
        assignments.append(
            Assignment(
                uid=uid,
                title=title,
                course=course,
                due=due,
                text=str(event.get("DESCRIPTION", "")).strip(),
                url=_link(str(event.get("URL", ""))),
            )
        )
    return sorted(assignments, key=lambda a: (a.due, a.title))


def _due(start: date | datetime, tz: tzinfo) -> datetime:
    if isinstance(start, datetime):
        return start.astimezone(tz) if start.tzinfo else start.replace(tzinfo=tz)
    return datetime.combine(start, ALL_DAY_DUE, tzinfo=tz)


def _split_title(summary: str) -> tuple[str, str | None]:
    match = COURSE_CODE.search(summary)
    if not match:
        return summary.strip(), None
    return summary[: match.start()].strip(), match.group(1).strip()


def _link(calendar_url: str) -> str | None:
    """The assignment's own page, rebuilt from the calendar link Canvas gives."""
    if not calendar_url:
        return None
    parts = urlparse(calendar_url)
    context = parse_qs(parts.query).get("include_contexts", [""])[0]
    if context.startswith("course_") and parts.fragment.startswith("assignment_"):
        course_id = context.removeprefix("course_")
        assignment_id = parts.fragment.removeprefix("assignment_")
        return f"https://{parts.netloc}/courses/{course_id}/assignments/{assignment_id}"
    return calendar_url
