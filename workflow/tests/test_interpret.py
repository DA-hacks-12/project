from datetime import datetime
from zoneinfo import ZoneInfo

from importer.feed import Assignment
from importer.interpret import Reading, check, message

ESSAY = Assignment(
    uid="event-assignment-101",
    title="Essay #2",
    course="ENGL C1000",
    due=datetime(2026, 10, 20, 23, 59, tzinfo=ZoneInfo("America/Los_Angeles")),
    text="Write a 1,200-word essay.",
    url=None,
)


def reading(**fields):
    return Reading(**{"deliverable": "Essay", "requirements": [], "minutes": 90, "work": "deep", **fields})


def test_keeps_minutes_in_range_only():
    assert check(reading(minutes=90)).minutes == 90
    assert check(reading(minutes=0)).minutes is None
    assert check(reading(minutes=5000)).minutes is None


def test_drops_empty_or_overlong_lines_and_tidies_spaces():
    assert check(reading(deliverable="  1,200-word   essay ")).deliverable == "1,200-word essay"
    assert check(reading(deliverable=" ")).deliverable is None
    assert check(reading(deliverable="x" * 161)).deliverable is None


def test_requirements_are_unique_and_at_most_five():
    found = check(reading(requirements=["MLA", "", "MLA", "a", "b", "c", "d", "e"]))
    assert found.requirements == ("MLA", "a", "b", "c", "d")


def test_message_carries_no_dates():
    text = message(ESSAY)
    assert "Essay #2" in text and "ENGL C1000" in text and "1,200-word" in text
    assert "2026" not in text


def test_message_says_when_the_feed_has_no_text():
    empty = Assignment(**{**ESSAY.__dict__, "text": ""})
    assert "no assignment text" in message(empty)
