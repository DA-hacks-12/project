from datetime import datetime
from zoneinfo import ZoneInfo

from rearrange.day import Day, Session
from rearrange.suggest import Pick, check_pick, free_time

LA = ZoneInfo("America/Los_Angeles")
AFTERNOON = datetime(2026, 10, 16, 15, 0, tzinfo=LA)
HOURS = [5] * 8 + [60] * 16


def test_no_break_for_none_or_an_evening_nap():
    assert check_pick(Pick(kind="none", minutes=10), AFTERNOON) is None
    assert check_pick(Pick(kind="nap", minutes=20), AFTERNOON.replace(hour=19)) is None


def test_break_length_is_held_to_the_research_range():
    rest = check_pick(Pick(kind="nap", minutes=45), AFTERNOON)
    assert rest is not None and rest.minutes == 20


def test_free_time_fills_the_longest_gaps_by_hour():
    session = Session("a", "Essay", None, AFTERNOON.replace(minute=45), 60, "deep")
    ideas = free_time(Day(AFTERNOON.date(), (session,)), HOURS, AFTERNOON)
    assert [(f"{i.start:%H:%M}", i.words) for i in ideas] == [
        ("15:00", "Take a walk outside."),
        ("16:45", "Go to a park or a trail."),
    ]
