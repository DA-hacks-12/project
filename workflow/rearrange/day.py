"""Today's arrangement: sessions, breaks, what was dismissed, and the active hours it's built on."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from importer.interpret import Work

Rest = Literal["nap", "walk", "eat", "move"]


@dataclass(frozen=True)
class Session:
    """A stretch of time on one task."""

    task: str
    title: str
    course: str | None
    start: datetime
    minutes: int
    work: Work

    @property
    def end(self) -> datetime:
        return self.start + timedelta(minutes=self.minutes)


@dataclass(frozen=True)
class Break:
    """A rest from What's wrong. Once placed, it never moves."""

    kind: Rest
    start: datetime
    minutes: int

    @property
    def end(self) -> datetime:
        return self.start + timedelta(minutes=self.minutes)


@dataclass(frozen=True)
class Dismissal:
    task: str
    at: datetime


@dataclass(frozen=True)
class Day:
    date: date
    sessions: tuple[Session, ...] = ()
    breaks: tuple[Break, ...] = ()
    dismissed: tuple[Dismissal, ...] = ()


def load_day(path: Path, today: date) -> Day:
    """The saved arrangement if it's today's, else an empty day."""
    if not path.exists():
        return Day(today)
    row = json.loads(path.read_text(encoding="utf-8"))
    if date.fromisoformat(row["date"]) != today:
        return Day(today)
    return Day(
        date=today,
        sessions=tuple(
            Session(**{**s, "start": datetime.fromisoformat(s["start"])}) for s in row["sessions"]
        ),
        breaks=tuple(
            Break(**{**b, "start": datetime.fromisoformat(b["start"])}) for b in row.get("breaks", [])
        ),
        dismissed=tuple(Dismissal(d["task"], datetime.fromisoformat(d["at"])) for d in row["dismissed"]),
    )


def save_day(path: Path, day: Day) -> None:
    row = {
        "date": day.date.isoformat(),
        "sessions": [{**asdict(s), "start": s.start.isoformat()} for s in day.sessions],
        "breaks": [{**asdict(b), "start": b.start.isoformat()} for b in day.breaks],
        "dismissed": [{"task": d.task, "at": d.at.isoformat()} for d in day.dismissed],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(row, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_activity(path: Path) -> list[int]:
    """The extension's 24 active-hour shares, 0–100, midnight first."""
    hours = json.loads(path.read_text(encoding="utf-8")).get("hours")
    if (
        not isinstance(hours, list)
        or len(hours) != 24
        or not all(isinstance(h, int) and 0 <= h <= 100 for h in hours)
    ):
        raise ValueError(f"{path} doesn't hold 24 active-hour shares")
    return hours
