"""Rearrange the rest of today into sessions, by research on time and attention.

Pipeline: code works out the open window, the tasks worth considering and any
dismissals → Claude proposes sessions in a fixed schema → code drops every
session that breaks a hard rule → the day is saved. Sessions that already
started stay where they are; only the rest of the day moves.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import replace
from datetime import datetime, time, timedelta

import anthropic
from pydantic import BaseModel

from importer.interpret import MODEL, Tally
from importer.store import Task

from .day import Break, Day, Dismissal, Session

EFFORT = "medium"
HORIZON = timedelta(days=14)
STEP = 15  # the window opens at the next quarter hour
AWAKE = 10  # an hour with a smaller active share is never used
SESSION = range(10, 121)  # minutes
DEEP_PER_DAY = 240  # about four hours of hard thinking a day is the most people sustain
FREE_SHARE = 1 / 3  # planning fallacy: a third of the awake window stays free
NOT_NOW = timedelta(hours=1)  # a dismissed task doesn't come back within the hour

SYSTEM = """\
You arrange the rest of a college student's day into work sessions on their coursework.

You get today's open window, the student's active hours (for each hour, the share of recent days they were on their laptop then), and their upcoming tasks with due time, minutes still to do, and whether the work is deep or light.

Arrange it the way research on time and attention says:
- Deadlines first. Work due today or tomorrow gets its time today and ends before it's due.
- Match work to the clock. People think best at the hours they're usually most active. Put deep work in the hours with the highest active share and light work in lower ones. Never use an hour under 10%.
- Spread long work out. Spaced sessions beat one long push: a task with more than 90 minutes left is split across the days before it's due, and today gets only today's share.
- One course at a time. Switching subjects costs focus, so put sessions of the same course next to each other and change course only after a break.
- Breaks. Sessions run 25 to 90 minutes, with at least 10 minutes between them.
- Leave room. People underestimate how long work takes, so keep at least a third of the window free, and no more than 4 hours of deep work in the day.
- A light day is fine. Arrange only what makes sense today.

Breaks already in the day are fixed: never put a session over one.

When the student has just dismissed a session, rearrange around it and change as little else as you can: keep the other sessions where they are unless moving one makes room.

Return sessions with the task id, a start time as HH:MM (24-hour) and minutes."""


class Proposed(BaseModel):
    task: str
    start: str
    minutes: int


class Arrangement(BaseModel):
    sessions: list[Proposed]


def rearrange(
    tasks: list[Task],
    hours: list[int],
    day: Day,
    now: datetime,
    client: anthropic.Anthropic,
    tally: Tally,
    dismiss: Session | None = None,
) -> Day:
    """The day with everything from now on arranged again."""
    dismissed = day.dismissed + ((Dismissal(dismiss.task, now),) if dismiss else ())
    sessions = [s for s in day.sessions if s != dismiss]
    kept = [s for s in sessions if s.start < now]
    upcoming = [s for s in sessions if s.start >= now]

    step = _next_step(now)
    start = _next_step(max([step] + [s.end for s in kept] + [b.end for b in day.breaks if b.start <= step]))
    end = datetime.combine(now.date() + timedelta(days=1), time(0), tzinfo=now.tzinfo)
    not_before = {d.task: d.at + NOT_NOW for d in dismissed}
    ids = {
        f"t{n}": task
        for n, task in enumerate(
            (t for t in tasks if t.interpretation and start < t.due <= now + HORIZON), start=1
        )
    }

    if start >= end or not ids:
        return replace(day, sessions=tuple(kept), dismissed=dismissed)
    breaks = tuple(b for b in day.breaks if b.end > start)
    text = message(ids, hours, start, end, kept, upcoming if dismiss else [], not_before, now, breaks)
    response = client.beta.messages.parse(
        model=MODEL,
        max_tokens=16000,
        output_config={"effort": EFFORT},
        output_format=Arrangement,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": text}],
    )
    tally.add(response.usage)
    proposed = response.parsed_output.sessions if response.parsed_output else []
    arranged = check(proposed, ids, hours, start, end, kept, not_before, breaks)
    return replace(day, sessions=tuple(kept + arranged), dismissed=dismissed)


def check(
    proposed: list[Proposed],
    ids: dict[str, Task],
    hours: list[int],
    start: datetime,
    end: datetime,
    kept: list[Session],
    not_before: dict[str, datetime],
    breaks: tuple[Break, ...] = (),
) -> list[Session]:
    """Keep the proposed sessions that hold, in time order; drop the rest."""
    done: dict[str, int] = defaultdict(int)
    for s in kept:
        done[s.task] += s.minutes
    deep = sum(s.minutes for s in kept if s.work == "deep")
    budget = _awake_minutes(hours, start, end) * (1 - FREE_SHARE)
    used = 0
    arranged: list[Session] = []

    for p in sorted(proposed, key=lambda p: p.start.zfill(5)):
        task = ids.get(p.task)
        at = _clock(p.start, start)
        if task is None or task.interpretation is None or at is None or p.minutes not in SESSION:
            continue
        found = task.interpretation
        session = Session(task.uid, task.title, task.course, at, p.minutes, found.work)
        if (
            session.start < max(start, not_before.get(task.uid, start))
            or session.end > min(end, task.due)
            or any(hours[h] < AWAKE for h in _hours_touched(session))
            or (arranged and session.start < arranged[-1].end)
            or any(session.start < b.end and b.start < session.end for b in breaks)
            or (found.minutes and done[task.uid] + p.minutes > found.minutes)
            or (found.work == "deep" and deep + p.minutes > DEEP_PER_DAY)
            or used + p.minutes > budget
        ):
            continue
        arranged.append(session)
        done[task.uid] += p.minutes
        deep += p.minutes if found.work == "deep" else 0
        used += p.minutes
    return arranged


def message(
    ids: dict[str, Task],
    hours: list[int],
    start: datetime,
    end: datetime,
    kept: list[Session],
    upcoming: list[Session],
    not_before: dict[str, datetime],
    now: datetime,
    breaks: tuple[Break, ...] = (),
) -> str:
    uids = {task.uid: tid for tid, task in ids.items()}
    done: dict[str, int] = defaultdict(int)
    for s in kept:
        done[s.task] += s.minutes
    lines = [
        f"Today is {now:%A, %B} {now.day}. Open from {start:%H:%M} to 24:00.",
        "",
        "Active hours:",
        *(f"{h:02d}:00 {hours[h]}%" for h in range(start.hour, 24)),
        "",
        "Tasks:",
    ]
    for tid, task in ids.items():
        found = task.interpretation
        assert found is not None
        left = f"{found.minutes - done[task.uid]} min left" if found.minutes else "time unknown"
        wait = not_before.get(task.uid)
        lines.append(
            " · ".join(
                part
                for part in (
                    tid,
                    f"due {_due(task.due, now)}",
                    left,
                    found.work,
                    task.course or "",
                    task.title,
                    f"not before {wait:%H:%M}" if wait and wait > start else "",
                )
                if part
            )
        )
    if breaks:
        lines += ["", "Breaks:"]
        lines += [f"{b.start:%H:%M}–{b.end:%H:%M} {b.kind}" for b in breaks]
    if upcoming:
        lines += ["", "Arranged before the dismissal:"]
        lines += [f"{uids[s.task]} {s.start:%H:%M} {s.minutes} min" for s in upcoming if s.task in uids]
    return "\n".join(lines)


def _due(due: datetime, now: datetime) -> str:
    days = (due.date() - now.date()).days
    if days == 0:
        return f"today {due:%H:%M}"
    if days == 1:
        return f"tomorrow {due:%H:%M}"
    return f"{due:%a %b} {due.day} {due:%H:%M} (in {days} days)"


def _clock(text: str, day: datetime) -> datetime | None:
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", text.strip())
    if not match or int(match[1]) > 23 or int(match[2]) > 59:
        return None
    return day.replace(hour=int(match[1]), minute=int(match[2]), second=0, microsecond=0)


def _next_step(now: datetime) -> datetime:
    at = now.replace(second=0, microsecond=0)
    if at < now:
        at += timedelta(minutes=1)
    return at + timedelta(minutes=-at.minute % STEP)


def _hours_touched(session: Session) -> range:
    return range(session.start.hour, (session.end - timedelta(minutes=1)).hour + 1)


def _awake_minutes(hours: list[int], start: datetime, end: datetime) -> int:
    minutes, at = 0, start
    while at < end:
        nxt = min(end, at.replace(minute=0) + timedelta(hours=1))
        if hours[at.hour] >= AWAKE:
            minutes += int((nxt - at).total_seconds() // 60)
        at = nxt
    return minutes
