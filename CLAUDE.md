# Project

A day planner for college students on Canvas. It turns their assignments into a plan that fits their body clock, then helps them focus through it. Not a todo app, a chatbot, or a Canvas replacement. Hackathon theme: "modern life and/or nature life".

Devices: laptop browser.

## A presentation project

It's built to be shown at the hackathon, not used by real students. Where this file and `~/.claude/CLAUDE.md` differ, this file wins.

- **Haiku 5.5 only** (`claude-haiku-5-5`) for every model call. No other model, and no comparing models or effort levels.
- **Don't optimize.** No eval sets, tuning runs, latency or caching work, or scaling. A prompt that works in the demo is done.
- **Craft goes where the audience looks.** What's on screen still meets the design bar in `~/.claude/CLAUDE.md`. What the demo never reaches (accounts, multi-user isolation, edge cases nobody will hit) is left out.

## Words

- **assignment**: what Canvas gives us.
- **task**: an assignment after import, with its interpretation.
- **import**: Canvas calendar feed → tasks.
- **interpretation**: what the model reads from one assignment: the deliverable (what to hand in), requirements, minutes (the time estimate) and work (`deep` or `light`). "Focus" is kept for focus mode.
- **active hours**: for each hour of the day, the share of recent days (0–100%) the student used their browser in that hour. It stands in for the chronotype.
- **rearrange the day**: the model lays today's tasks into sessions. Rearranging runs again whenever the student asks or dismisses a session.
- **session**: a stretch of time on one task, with a start and minutes.
- **dismiss**: the student says "not now" to a session. That task can't start again within the hour, and the rest of the day is rearranged around it.
- **what's wrong**: the question asked on every dismissal. The answer can earn a **break** (nap, walk, eat or move), which is placed in the day and never moves.
- **free time**: open gaps in the day. The longest ones get an outdoor idea.
- **focus mode**: planned, below. ("Reschedule" is retired; dismiss covers it.)

## Functions, in build order

1. **Import**: built, as a Python workflow with no UI yet.
2. **Active hours**: built, in the Chrome extension.
3. **Rearrange the day**: built, as a Python workflow, including dismiss.
4. **Focus mode**: full-screen pomodoro on one task, optional lofi, quick notes; the extension blocks entertainment sites.
5. **What's wrong and free time**: built, as a Python workflow. Scheduling is complete.

Cut for the hackathon: sleep screenshots and the sleep questionnaire. Active hours replace the questionnaire; using browser activity is the owner's call for this demo.

## Active hours

The extension (`extension/`, Manifest V3, plain JS) reads the last 28 days of Chrome history, so it has data on day one with no background tracking. Only this device's visits count. For each hour, the share of those days with any visit in that hour gives 24 numbers. The math is in `activity.js`; the wiring is in `background.js`.

For now, clicking the toolbar button saves `activity.json` to Downloads, and the workflow reads it through `ACTIVITY` in `workflow/.env`. Once the web app exists, the extension sends the numbers to it instead. Install: chrome://extensions → Developer mode → Load unpacked → `extension/`.

## Rearrange the day

Pipeline: code works out the open window (from the next quarter hour to midnight), the tasks due in the next 14 days, minutes already done today, and any dismissals → Claude Haiku 5.5 (medium effort) proposes sessions as task id + HH:MM + minutes → code drops every session that breaks a hard rule → the day is saved. Sessions that already started never move. Lives in `workflow/rearrange/`: `arrange.py` (prompt, model call, checks), `day.py` (the saved day and the active-hours file), `__main__.py` (command line).

The prompt carries only time-based research. Retrieval practice (self-testing) is deliberately left out to keep the purpose clear.
- Deadlines first: work due today or tomorrow ends before it's due.
- Synchrony effect: deep work in the hours with the highest active share, light work in lower ones.
- Spacing: work over 90 minutes is split across the days before it's due.
- Switch cost: one course at a time; change course only after a break.
- Breaks: sessions of 25–90 minutes, at least 10 minutes apart.
- Planning fallacy: a third of the awake window stays free, and deep work is capped at 4 hours a day.
- After a dismissal, change as little else as possible.

Code checks (`check`): the task exists, the time parses, the session is 10–120 minutes long, inside the window, after any dismissal's hour, ends before the task is due, never in an hour under 10% active, doesn't overlap, doesn't exceed the task's minutes for today, the 4-hour deep cap, or the free third.

Breaks are fixed: the window opens after a break that's under way, and `check` drops any session overlapping a break.

Run: `cd workflow && uv run python -m rearrange [--at HH:MM]`, and `uv run python -m rearrange dismiss N [--why "..."] [--at HH:MM]`. `--at` sets the clock for demos. Saved to `workflow/data/day.json`; a new day starts empty.

## What's wrong and free time

Lives in `workflow/rearrange/suggest.py`.

What's wrong: dismissing a session asks "What's wrong?" (or takes `--why`). The answer, the time, this hour's active share, minutes worked today and the last break go to Claude Haiku 5.5 (low effort). It returns one kind from a fixed list, plus minutes. Code holds the minutes to that kind's range and writes the words shown. The break starts now, or when an ongoing session ends, and the day is rearranged around it.
- **nap**, 10–20 min: sleepy or drained. Longer naps leave you groggy, and there are no naps after 6pm because they cost night sleep.
- **walk**, 10–30 min: can't focus, restless, stressed. Attention Restoration Theory: time outside restores focus.
- **eat**, 15–40 min: hungry.
- **move**, 5–15 min: stiff, bored, sitting too long.
- **none**: vague or empty answers get no break, only the rearrangement.

Free time: plain code, no model, worked out on display and not saved. Open gaps of 30+ minutes in awake hours get an outdoor idea by the hour: morning light before noon, lunch outside until 2pm, a walk (a park or trail if the gap is an hour or more) until 6pm, then stepping outside to look at the sky. At most three a day, on the longest gaps, with each idea used once.

## Import

The student gives their Canvas calendar feed link once (Canvas → Calendar → Calendar Feed). Each upcoming assignment becomes a task: title, course, due time, a link to the assignment page, and its interpretation.

Pipeline: feed → read assignments → only new or changed ones go to Claude → check every field → save. Lives in `workflow/importer/`: `feed.py` (read the feed), `interpret.py` (the prompt, schema and checks), `store.py` (saved tasks), `run.py` (the pipeline), `__main__.py` (command line).

- Feed link, not a Canvas login key: every student has one, and the school doesn't need to approve anything.
- Canvas writes an assignment due at 11:59pm as an all-day date. Code sets it back to 11:59pm in the student's time zone.
- Only assignments come in (UIDs `event-…assignment…-<id>`). Class meetings and personal events are skipped, and so is anything already past due.
- Assignments in locked modules have no text in the feed, so they're interpreted from the title alone.
- Model: Claude Haiku 5.5 at low effort, with a fixed output schema. Haiku has no server-side fallback, so a refused read is skipped like any failed one. The model never sees dates. Code drops fields that don't hold: minutes outside 5 to 2,400, empty lines or lines over 160 characters, more than 5 requirements. Gaps stay empty and are never guessed.
- Each assignment is read once per version of its text (fingerprint of course + title + text). An extension alone doesn't cost a model call. A failed read is retried on the next import.

Run: `cd workflow && uv run python -m importer [feed link or .ics]` (defaults to `CANVAS_FEED` in `workflow/.env`, next to `ANTHROPIC_API_KEY`; the key is server-only, never committed or printed). Tasks are saved to `workflow/data/tasks.json` (not committed). Checks: `uv run ruff check . && uv run pyright && uv run pytest`.
