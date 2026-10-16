"""uv run python -m rearrange [--at HH:MM]
uv run python -m rearrange dismiss N [--why "..."] [--at HH:MM]

Arranges the rest of today from the imported tasks and the extension's active
hours. Dismissing session N asks "What's wrong?", places a break if the answer
calls for one, and rearranges around both. Free time gets outdoor ideas.
`--at` sets the clock, for demos. The day is saved to workflow/data/day.json.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import replace
from datetime import datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from tzlocal import get_localzone

from importer import store
from importer.__main__ import duration
from importer.interpret import Tally

from .arrange import rearrange
from .day import Day, load_activity, load_day, save_day
from .suggest import free_time, whats_wrong, words

ROOT = Path(__file__).resolve().parents[1]
TASKS = ROOT / "data" / "tasks.json"
DAY = ROOT / "data" / "day.json"


def main() -> None:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(prog="rearrange")
    parser.add_argument("command", nargs="?", choices=["dismiss"])
    parser.add_argument("number", nargs="?", type=int)
    parser.add_argument("--why", help="what's wrong, instead of being asked")
    parser.add_argument("--at", help="HH:MM")
    args = parser.parse_args()

    tz = get_localzone()
    now = datetime.now(tz).replace(second=0, microsecond=0)
    if args.at:
        hour, minute = map(int, args.at.split(":"))
        now = now.replace(hour=hour, minute=minute)

    activity = Path(os.environ.get("ACTIVITY", "~/Downloads/activity.json")).expanduser()
    if not activity.exists():
        sys.exit(f"No active hours at {activity}. Click the extension's button to save them.")
    hours = load_activity(activity)
    tasks = sorted(store.load(TASKS).values(), key=lambda t: t.due)
    day = load_day(DAY, now.date())

    dismiss = None
    if args.command == "dismiss":
        if not args.number or not 1 <= args.number <= len(day.sessions):
            sys.exit("No session with that number today.")
        dismiss = day.sessions[args.number - 1]
        if dismiss.end <= now:
            sys.exit("That session is already over.")

    client, tally, rest = anthropic.Anthropic(), Tally(), None
    try:
        if dismiss:
            answer = args.why if args.why is not None else ask()
            begin = max([now] + [s.end for s in day.sessions if s != dismiss and s.start < now])
            rest = whats_wrong(answer, begin, hours, day, dismiss, client, tally)
            if rest:
                day = replace(day, breaks=day.breaks + (rest,))
        day = rearrange(tasks, hours, day, now, client, tally, dismiss)
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        sys.exit("Claude didn't accept the API key. Set ANTHROPIC_API_KEY in workflow/.env.")
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as error:
        sys.exit(f"Couldn't reach Claude ({type(error).__name__}); the day is unchanged.")
    save_day(DAY, day)

    if dismiss:
        print(f"Dismissed {dismiss.title}.")
        print(f"{words(rest)}\n" if rest else "")
    print(show(day, hours, now))
    print(f"\n${tally.dollars:.4f}")


def ask() -> str:
    return input("What's wrong? ") if sys.stdin.isatty() else ""


def show(day: Day, hours: list[int], now: datetime) -> str:
    rows: list[tuple[datetime, list[str]]] = []
    for n, s in enumerate(day.sessions, start=1):
        over = "  (over)" if s.end <= now else ""
        rows.append(
            (
                s.start,
                [
                    f"{n:>2}  {span(s.start, s.end)}  {s.work:<5}  {s.title}{over}",
                    f"{'':>28}{s.course or ''}",
                ],
            )
        )
    for b in day.breaks:
        rows.append((b.start, [f"    {span(b.start, b.end)}  break  {words(b)}"]))
    for idea in free_time(day, hours, now):
        rows.append((idea.start, [f"    {span(idea.start, idea.end)}  free   {idea.words}"]))

    deep = sum(s.minutes for s in day.sessions if s.work == "deep")
    total = sum(s.minutes for s in day.sessions)
    lines = [f"{now:%a %b} {now.day}, {clock(now).strip()}", ""]
    for _, row in sorted(rows, key=lambda r: r[0]):
        lines += row
    lines += ["", f"{duration(total) or '0m'} arranged · {duration(deep) or '0m'} deep"]
    return "\n".join(lines)


def span(start: datetime, end: datetime) -> str:
    return f"{clock(start)}–{clock(end)}"


def clock(at: datetime) -> str:
    return f"{at:%-I:%M}{at:%p}".lower().rjust(7)


if __name__ == "__main__":
    main()
