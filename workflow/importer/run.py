"""Import: Canvas feed → read → only new or changed assignments go to Claude → saved tasks."""

from __future__ import annotations

from datetime import datetime, tzinfo
from pathlib import Path

from . import feed, store
from .interpret import Tally, interpret_all
from .store import Task


async def import_feed(source: str, tz: tzinfo, now: datetime, path: Path) -> tuple[list[Task], Tally]:
    assignments = feed.parse(feed.read(source), tz, now)
    saved = store.load(path)
    fresh = [a for a in assignments if store.known(saved, a) is None]
    read, tally = await interpret_all(fresh)
    tasks = [store.task(a, read.get(a.uid) or store.known(saved, a)) for a in assignments]
    store.save(path, tasks)
    return tasks, tally
