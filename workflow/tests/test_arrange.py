from datetime import datetime
from zoneinfo import ZoneInfo

from importer.interpret import Interpretation
from importer.store import Task
from rearrange.arrange import Proposed, check

LA = ZoneInfo("America/Los_Angeles")
START = datetime(2026, 10, 16, 14, 0, tzinfo=LA)
END = datetime(2026, 10, 17, 0, 0, tzinfo=LA)
HOURS = [5] * 8 + [60] * 16  # asleep until 8am


def task(uid: str, due_hour: int = 23, minutes: int = 120, work: str = "deep") -> Task:
    due = START.replace(hour=due_hour, minute=59)
    return Task(uid, uid, "PSYC", due, None, "", Interpretation(None, (), minutes, work))  # type: ignore[arg-type]


def kept(proposed: list[Proposed], ids: dict[str, Task], not_before: dict[str, datetime] | None = None):
    return [
        (s.task, f"{s.start:%H:%M}") for s in check(proposed, ids, HOURS, START, END, [], not_before or {})
    ]


def test_keeps_sessions_that_hold():
    ids = {"t1": task("a"), "t2": task("b", work="light")}
    proposed = [
        Proposed(task="t1", start="14:30", minutes=60),
        Proposed(task="t2", start="15:45", minutes=30),
    ]
    assert kept(proposed, ids) == [("a", "14:30"), ("b", "15:45")]


def test_drops_overlaps_unknown_tasks_and_bad_times():
    ids = {"t1": task("a"), "t2": task("b")}
    proposed = [
        Proposed(task="t1", start="14:30", minutes=60),
        Proposed(task="t2", start="15:00", minutes=30),
        Proposed(task="t9", start="17:00", minutes=30),
        Proposed(task="t2", start="25:00", minutes=30),
        Proposed(task="t2", start="13:00", minutes=30),
    ]
    assert kept(proposed, ids) == [("a", "14:30")]


def test_drops_sessions_ending_after_the_due_time():
    ids = {"t1": task("a", due_hour=15)}
    assert kept([Proposed(task="t1", start="15:30", minutes=45)], ids) == []


def test_a_dismissed_task_waits_its_hour():
    ids = {"t1": task("a")}
    later = {"a": START.replace(hour=15)}
    proposed = [
        Proposed(task="t1", start="14:30", minutes=30),
        Proposed(task="t1", start="15:15", minutes=30),
    ]
    assert kept(proposed, ids, later) == [("a", "15:15")]


def test_caps_deep_work_at_four_hours():
    ids = {"t1": task("a", minutes=300), "t2": task("b", minutes=300)}
    proposed = [
        Proposed(task="t1", start="14:00", minutes=120),
        Proposed(task="t2", start="16:15", minutes=120),
        Proposed(task="t1", start="18:30", minutes=60),
    ]
    assert kept(proposed, ids) == [("a", "14:00"), ("b", "16:15")]


def test_sessions_stay_off_breaks():
    from rearrange.day import Break

    ids = {"t1": task("a")}
    rest = (Break("walk", START.replace(hour=15), 20),)
    proposed = [
        Proposed(task="t1", start="15:10", minutes=30),
        Proposed(task="t1", start="15:30", minutes=30),
    ]
    sessions = check(proposed, ids, HOURS, START, END, [], {}, rest)
    assert [f"{s.start:%H:%M}" for s in sessions] == ["15:30"]
