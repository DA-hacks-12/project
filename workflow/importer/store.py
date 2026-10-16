"""Saved tasks: each upcoming assignment with its interpretation.

An interpretation is kept with a fingerprint of the text it was read from, so
an import only sends assignments that are new or whose title or text changed.
A due-date change alone (an extension) never costs a model call.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from .feed import Assignment
from .interpret import Interpretation


@dataclass(frozen=True)
class Task:
    uid: str
    title: str
    course: str | None
    due: datetime
    url: str | None
    fingerprint: str
    interpretation: Interpretation | None


def fingerprint(assignment: Assignment) -> str:
    text = f"{assignment.course}\n{assignment.title}\n{assignment.text}"
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def known(saved: dict[str, Task], assignment: Assignment) -> Interpretation | None:
    """The saved interpretation, if it was read from this same text."""
    task = saved.get(assignment.uid)
    if task and task.fingerprint == fingerprint(assignment):
        return task.interpretation
    return None


def task(assignment: Assignment, interpretation: Interpretation | None) -> Task:
    return Task(
        uid=assignment.uid,
        title=assignment.title,
        course=assignment.course,
        due=assignment.due,
        url=assignment.url,
        fingerprint=fingerprint(assignment),
        interpretation=interpretation,
    )


def load(path: Path) -> dict[str, Task]:
    if not path.exists():
        return {}
    tasks = {}
    for row in json.loads(path.read_text(encoding="utf-8")):
        found = row["interpretation"]
        interpretation = (
            Interpretation(**{**found, "requirements": tuple(found["requirements"])}) if found else None
        )
        tasks[row["uid"]] = Task(
            **{**row, "due": datetime.fromisoformat(row["due"]), "interpretation": interpretation}
        )
    return tasks


def save(path: Path, tasks: list[Task]) -> None:
    rows = [{**asdict(t), "due": t.due.isoformat()} for t in tasks]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
