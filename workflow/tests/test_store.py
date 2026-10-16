from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from importer.feed import Assignment
from importer.interpret import Interpretation
from importer.store import known, load, save, task

ESSAY = Assignment(
    uid="event-assignment-101",
    title="Essay #2",
    course="ENGL C1000",
    due=datetime(2026, 10, 20, 23, 59, tzinfo=ZoneInfo("America/Los_Angeles")),
    text="Write a 1,200-word essay.",
    url="https://school.instructure.com/courses/1/assignments/101",
)
READ = Interpretation("1,200-word essay", ("MLA format",), 180, "deep")


def test_save_and_load_round_trip(tmp_path):
    path = tmp_path / "tasks.json"
    tasks = [task(ESSAY, READ), task(replace(ESSAY, uid="event-assignment-102"), None)]
    save(path, tasks)
    assert list(load(path).values()) == tasks


def test_same_text_is_not_read_again():
    saved = {ESSAY.uid: task(ESSAY, READ)}
    assert known(saved, ESSAY) == READ


def test_an_extension_alone_is_not_read_again():
    saved = {ESSAY.uid: task(ESSAY, READ)}
    assert known(saved, replace(ESSAY, due=ESSAY.due + timedelta(days=2))) == READ


def test_changed_text_is_read_again():
    saved = {ESSAY.uid: task(ESSAY, READ)}
    assert known(saved, replace(ESSAY, text="Write a 2,000-word essay.")) is None
