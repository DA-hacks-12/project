"""uv run python -m importer [Canvas feed link or .ics file]

Without an argument it reads CANVAS_FEED from workflow/.env. Prints the tasks
and saves them to workflow/data/tasks.json.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.error import URLError

import anthropic
from dotenv import load_dotenv
from tzlocal import get_localzone

from .run import import_feed
from .store import Task

ROOT = Path(__file__).resolve().parents[1]
TASKS = ROOT / "data" / "tasks.json"


def main() -> None:
    load_dotenv(ROOT / ".env")
    source = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CANVAS_FEED")
    if not source:
        sys.exit("Give a Canvas feed link or .ics file, or set CANVAS_FEED in workflow/.env.")
    tz = get_localzone()
    try:
        tasks, tally = asyncio.run(import_feed(source, tz, datetime.now(tz), TASKS))
    except (URLError, OSError) as error:
        sys.exit(f"Couldn't read the feed: {error}")
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        sys.exit("Claude didn't accept the API key. Set ANTHROPIC_API_KEY in workflow/.env.")

    print("\n\n".join(show(t) for t in tasks))
    unread = sum(1 for t in tasks if t.interpretation is None)
    print(
        f"\n{len(tasks)} upcoming · {tally.calls} read by Claude (${tally.dollars:.2f})"
        + (f" · {unread} unread, the next import tries again" if unread else "")
    )


def show(task: Task) -> str:
    due = task.due.strftime("%a %b %-d, %-I:%M") + task.due.strftime("%p").lower()
    lines = [f"{due}  {task.title}", f"  {task.course or ''}"]
    found = task.interpretation
    if found:
        facts = [found.deliverable, duration(found.minutes), found.work]
        lines.append("  " + " · ".join(f for f in facts if f))
        lines += [f"  - {r}" for r in found.requirements]
    return "\n".join(lines)


def duration(minutes: int | None) -> str | None:
    if minutes is None:
        return None
    hours, rest = divmod(minutes, 60)
    return " ".join(part for part in (f"{hours}h" if hours else "", f"{rest}m" if rest else "") if part)


if __name__ == "__main__":
    main()
