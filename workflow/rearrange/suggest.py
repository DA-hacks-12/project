"""What's wrong and free time.

What's wrong: after a dismissal the student says what's wrong in a few words.
Claude picks one break from a fixed list; code checks it and writes the words
shown. Vague answers get no break. Free time: plain code puts an outdoor idea
on the longest open gaps in the day, sized to the gap and the hour.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Literal

import anthropic
from pydantic import BaseModel

from importer.interpret import MODEL, Tally

from .arrange import AWAKE
from .day import Break, Day, Rest, Session

EFFORT = "low"
LENGTH: dict[Rest, range] = {
    "nap": range(10, 21),  # longer naps leave you groggy
    "walk": range(10, 31),
    "eat": range(15, 41),
    "move": range(5, 16),
}
LAST_NAP = time(18, 0)  # later naps cost night sleep
WORDS: dict[Rest, str] = {
    "nap": "Nap for {m} minutes. Set an alarm.",
    "walk": "Walk outside for {m} minutes.",
    "eat": "Eat something. Take {m} minutes.",
    "move": "Get up and move for {m} minutes.",
}

FREE_GAP = 30  # minutes
FREE_PER_DAY = 3

SYSTEM = """\
A college student just dismissed a work session and said what's wrong. Pick the one break most likely to help:

nap, 10 to 20 minutes: sleepy or drained, especially in the early-afternoon dip. Short naps refresh without grogginess. Never in the evening.
walk, 10 to 30 minutes: can't focus, restless, stressed or mentally worn out. Time outside, ideally near trees or water, restores attention.
eat, 15 to 40 minutes: hungry, shaky, or hasn't eaten in a while.
move, 5 to 15 minutes: stiff, bored, or has been sitting too long.
none: the answer doesn't point to any of these, or is too vague to tell. Don't guess.

Use the time of day and how long they've been working to choose the kind and the minutes."""


class Pick(BaseModel):
    kind: Literal["nap", "walk", "eat", "move", "none"]
    minutes: int


@dataclass(frozen=True)
class Idea:
    """An outdoor suggestion for free time. Not saved; worked out on display."""

    start: datetime
    minutes: int
    words: str

    @property
    def end(self) -> datetime:
        return self.start + timedelta(minutes=self.minutes)


def whats_wrong(
    answer: str,
    start: datetime,
    hours: list[int],
    day: Day,
    dismissed: Session,
    client: anthropic.Anthropic,
    tally: Tally,
) -> Break | None:
    """One break starting at `start`, or None when the answer doesn't call for one."""
    if not answer.strip():
        return None
    worked = sum(min(s.minutes, max(0, int((start - s.start).total_seconds() // 60))) for s in day.sessions)
    rested = max((b.end for b in day.breaks if b.end <= start), default=None)
    text = "\n".join(
        [
            f"It's {start:%H:%M}. Active share this hour: {hours[start.hour]}%.",
            f"Worked today: {worked} min. Last break: {f'ended {rested:%H:%M}' if rested else 'none yet'}.",
            f"Dismissed: {dismissed.title} ({dismissed.work} work).",
            "",
            f"What's wrong, in their words:\n<answer>\n{answer.strip()}\n</answer>",
        ]
    )
    response = client.beta.messages.parse(
        model=MODEL,
        max_tokens=16000,
        output_config={"effort": EFFORT},
        output_format=Pick,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": text}],
    )
    tally.add(response.usage)
    return check_pick(response.parsed_output, start)


def check_pick(pick: Pick | None, start: datetime) -> Break | None:
    if pick is None or pick.kind == "none":
        return None
    if pick.kind == "nap" and start.time() >= LAST_NAP:
        return None
    length = LENGTH[pick.kind]
    return Break(pick.kind, start, min(max(pick.minutes, length.start), length.stop - 1))


def words(rest: Break) -> str:
    return WORDS[rest.kind].format(m=rest.minutes)


def free_time(day: Day, hours: list[int], start: datetime) -> list[Idea]:
    """Outdoor ideas for the longest open gaps from `start` to midnight."""
    end = datetime.combine(start.date() + timedelta(days=1), time(0), tzinfo=start.tzinfo)
    busy = sorted([(s.start, s.end) for s in day.sessions] + [(b.start, b.end) for b in day.breaks])
    gaps: list[tuple[datetime, datetime]] = []
    at = start
    for b_start, b_end in [*busy, (end, end)]:
        if b_start > at:
            gaps += _awake_runs(hours, at, min(b_start, end))
        at = max(at, b_end)
    open_gaps = [(a, b) for a, b in gaps if (b - a) >= timedelta(minutes=FREE_GAP)]
    ideas: list[Idea] = []
    for a, b in sorted(open_gaps, key=lambda g: g[1] - g[0], reverse=True):
        idea = _idea(a, int((b - a).total_seconds() // 60))
        if len(ideas) < FREE_PER_DAY and idea.words not in {i.words for i in ideas}:
            ideas.append(idea)
    return sorted(ideas, key=lambda i: i.start)


def _idea(start: datetime, gap: int) -> Idea:
    if start.hour < 12:
        minutes, text = 15, "Get morning light outside."
    elif start.hour < 14:
        minutes, text = 30, "Eat lunch outside."
    elif start.hour < 18:
        minutes, text = (45, "Go to a park or a trail.") if gap >= 60 else (20, "Take a walk outside.")
    else:
        minutes, text = 10, "Step outside and look at the sky."
    return Idea(start, min(minutes, gap), text)


def _awake_runs(hours: list[int], start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """Split a gap into the stretches that fall in awake hours."""
    runs: list[tuple[datetime, datetime]] = []
    at = start
    while at < end:
        nxt = min(end, at.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
        if hours[at.hour] >= AWAKE:
            if runs and runs[-1][1] == at:
                runs[-1] = (runs[-1][0], nxt)
            else:
                runs.append((at, nxt))
        at = nxt
    return runs
