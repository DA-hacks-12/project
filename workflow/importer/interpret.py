"""One assignment → what to hand in, key requirements, minutes and kind of work.

Claude reads each assignment once, when it first comes in or its text changes,
and fills a fixed schema. Code checks every field and drops what doesn't hold;
it never fills a gap with a guess. Dates never go to the model.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from typing import Literal

import anthropic
from anthropic.types.beta import BetaUsage
from pydantic import BaseModel, ValidationError

from .feed import Assignment

MODEL = "claude-haiku-5-5"
EFFORT = "low"
# Dollars per million tokens for MODEL (prompts under 100K tokens).
PRICE = {"input": 0.10, "output": 0.50, "cache_write": 0.125, "cache_read": 0.01}
CONCURRENCY = 8

MAX_REQUIREMENTS = 5
MAX_LINE = 160
MINUTES = range(5, 40 * 60 + 1)

Work = Literal["deep", "light"]

# Stable, so it goes first and can be cached; the assignment goes last.
SYSTEM = """\
You read one Canvas assignment for a college student and pull out what they need to plan their time.

deliverable: One plain line naming what they hand in or do, with its size when stated, e.g. "1,200-word argument essay, PDF upload" or "20-question timed quiz in Canvas". Null if neither the title nor the text says what the work is.

requirements: What would cost points if missed: length, format, sources, required parts, where and how to submit. Only what the text states, most important first, at most 5, each a short instruction under 15 words. Empty if the text states none.

minutes: Total time a typical undergraduate needs to do it well, from reading the instructions to submitting, including any reading or watching the assignment depends on. Null if the title and text don't tell you what the work is.

work: "deep" when it needs sustained thinking (writing, problem sets, projects, exam prep); "light" when it is short or routine (a quick quiz, a discussion reply, a survey, an upload).

Use only what the title and text say; don't invent lengths, sources or rubric items. Skip boilerplate that comes with every assignment (honor code, late policy, navigation hints) unless it changes what to do."""


class Reading(BaseModel):
    """The model's answer. The API enforces its shape; `check` decides what holds."""

    deliverable: str | None
    requirements: list[str]
    minutes: int | None
    work: Work


@dataclass(frozen=True)
class Interpretation:
    deliverable: str | None
    requirements: tuple[str, ...]
    minutes: int | None
    work: Work


@dataclass
class Tally:
    """Model calls made and what they cost, for the run's report."""

    calls: int = 0
    dollars: float = 0.0

    def add(self, usage: BetaUsage) -> None:
        self.calls += 1
        self.dollars += (
            usage.input_tokens * PRICE["input"]
            + usage.output_tokens * PRICE["output"]
            + (usage.cache_creation_input_tokens or 0) * PRICE["cache_write"]
            + (usage.cache_read_input_tokens or 0) * PRICE["cache_read"]
        ) / 1_000_000


def check(reading: Reading) -> Interpretation:
    requirements: list[str] = []
    for line in map(_line, reading.requirements):
        if line and line not in requirements:
            requirements.append(line)
    return Interpretation(
        deliverable=_line(reading.deliverable),
        requirements=tuple(requirements[:MAX_REQUIREMENTS]),
        minutes=reading.minutes if reading.minutes in MINUTES else None,
        work=reading.work,
    )


def _line(text: str | None) -> str | None:
    if text is None:
        return None
    text = " ".join(text.split())
    return text if 0 < len(text) <= MAX_LINE else None


def message(assignment: Assignment) -> str:
    text = assignment.text or "(The feed has no assignment text.)"
    return (
        f"Course: {assignment.course or 'unknown'}\n"
        f"Title: {assignment.title}\n\n"
        f"<assignment_text>\n{text}\n</assignment_text>"
    )


async def interpret(
    client: anthropic.AsyncAnthropic, assignment: Assignment, tally: Tally
) -> Interpretation | None:
    """None when the model's answer can't be used; the next import tries again."""
    try:
        response = await client.beta.messages.parse(
            model=MODEL,
            max_tokens=16000,
            output_config={"effort": EFFORT},
            output_format=Reading,
            system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": message(assignment)}],
        )
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        raise
    except (anthropic.APIStatusError, anthropic.APIConnectionError, ValidationError) as error:
        print(f"Skipped {assignment.title!r}: {type(error).__name__}", file=sys.stderr)
        return None
    tally.add(response.usage)
    if response.stop_reason != "end_turn" or response.parsed_output is None:
        print(f"Skipped {assignment.title!r}: {response.stop_reason}", file=sys.stderr)
        return None
    return check(response.parsed_output)


async def interpret_all(
    assignments: list[Assignment],
) -> tuple[dict[str, Interpretation | None], Tally]:
    tally = Tally()
    if not assignments:
        return {}, tally
    gate = asyncio.Semaphore(CONCURRENCY)
    async with anthropic.AsyncAnthropic() as client:

        async def one(assignment: Assignment) -> tuple[str, Interpretation | None]:
            async with gate:
                return assignment.uid, await interpret(client, assignment, tally)

        results = await asyncio.gather(*(one(a) for a in assignments))
    return dict(results), tally
