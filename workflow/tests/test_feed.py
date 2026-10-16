from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from importer.feed import parse

LA = ZoneInfo("America/Los_Angeles")
NOW = datetime(2026, 10, 16, 12, 0, tzinfo=LA)
ICS = (Path(__file__).parent / "fixtures" / "canvas.ics").read_text()


def by_uid():
    return {a.uid: a for a in parse(ICS, LA, NOW)}


def test_keeps_upcoming_assignments_soonest_first():
    assignments = parse(ICS, LA, NOW)
    assert [a.uid for a in assignments] == [
        "event-sub-assignment-9",
        "event-assignment-101",
        "event-assignment-102",
        "event-assignment-override-77",
    ]


def test_all_day_assignment_is_due_at_1159pm_local():
    assert by_uid()["event-assignment-101"].due == datetime(2026, 10, 20, 23, 59, tzinfo=LA)


def test_timed_assignment_moves_into_local_time():
    assert by_uid()["event-assignment-102"].due == datetime(2026, 10, 21, 14, 30, tzinfo=LA)


def test_splits_course_code_from_title():
    essay = by_uid()["event-assignment-101"]
    assert essay.title == "✏️ Essay #2"
    assert essay.course == "F26 ENGL C1000 47Y Academic Reading And Writing"
    assert by_uid()["event-assignment-102"].course == "F26 PSYC D024 01Z, 50Z, 51Z Intro Psychobiology"


def test_links_to_the_assignment_page():
    essay = by_uid()["event-assignment-101"]
    assert essay.url == "https://school.instructure.com/courses/48180/assignments/101"


def test_reads_plain_text_and_allows_none():
    tasks = by_uid()
    assert tasks["event-assignment-101"].text == "Write a 1,200-word essay.\n\nCite three sources."
    assert tasks["event-assignment-102"].text == ""
