@AGENTS.md

# Project

A day planner for college students on Canvas. It turns their assignments into a plan that fits their body clock, then helps them focus through it. Not a todo app, a chatbot, or a Canvas replacement. Hackathon theme: "modern life and/or nature life".

Devices: laptop browser.

## How we build it

It began as a hackathon presentation. On 2026-10-16 the owner moved it to full-effort development: the standards in `~/.claude/CLAUDE.md` apply in full. Where this file and that one differ, this file wins.

- **Haiku 5.5 only** (`claude-haiku-5-5`) for every model call. No other model, and no comparing models or effort levels.
- **Mature libraries over hand-rolled UI** (the owner's call): Radix Themes for controls and floating cards, FullCalendar for the week grid, styled from one palette.
- **Sign-in is an email, nothing more** (the owner's call): typing an email identifies the student, new or returning, with no code or password. Anyone who types an email gets that planner, which is fine for demos and not for real students.

## Words

- **assignment**: what Canvas gives us.
- **task**: an assignment after import, with its interpretation.
- **import**: a Canvas calendar feed → tasks.
- **feed**: one school's Canvas, named by its address ("deanza.instructure.com"). A student can have several, each from a feed link or an uploaded `.ics` file.
- **interpretation**: what the model reads from one assignment: the deliverable (what to hand in), requirements, minutes (the time estimate) and work (`deep` or `light`). "Focus" is kept for focus mode.
- **active hours**: for each hour of the day, the share of recent days (0–100%) the student used their browser in that hour. It stands in for the chronotype. Learned by the optional extension ("usage pattern learning"); until then plans use **default hours**, 8am to 11pm with none preferred.
- **extension**: the Chrome extension. Optional: the app never requires or asks for it. When connected it unlocks usage pattern learning and **Lockdown**.
- **lockdown**: in focus mode, entertainment sites are blocked while the session runs. Only offered when the extension is connected.
- **block**: anything on the calendar: a session, a break, an event, or a free-time idea.
- **session**: a stretch of time on one task, with a start and minutes.
- **event**: the student's own block, added with "+" (a class, a shift at work).
- **week**: the school week, Sunday to Saturday ("that's how school works"). A plan covers today through Saturday; on Sunday the next week starts.
- **reschedule**: the one way to (re)plan: it asks "What's wrong?" and how much may move (**scope**), then plans. ("Rearrange" is retired.)
- **scope**: what may move. **Hour**: only the work in the next hour, pushed after it. **Day**: today's remaining work. **Week**: everything this week. A busy time or lighter day from the answer also moves the work it touches.
- **lighter day**: a day the answer asked to carry less ("I feel sick today"): at most so many minutes, and no deep work unless it says so. Shown as a chip on Day; deletable.
- **biggest priority**: shown with every Reschedule result: the open tasks due soonest, then the most work left. Plain code.
- **reschedule from a session**: a session card's Reschedule. That session moves and its task waits an hour, plus whatever the scope opens up. ("Dismiss" is retired.)
- **what's wrong**: the question Reschedule asks first. The answer can become a lighter day, a **busy time** (one of the student's events, titled in their words: "Brother's wedding"), or a **break** now (nap, walk, eat or move). An empty or vague answer changes nothing.
- **free time**: open gaps in a day. The longest ones get an outdoor idea, naming a real nearby place when there is one.
- **due**: an assignment shown on the day it's due ("assignment block" in the sketches).
- **reminders**: stray thoughts written down so they stop nagging ("buy food").
- **focus mode**: one session, full screen, in pomodoros.

## Functions

All built in the web app. The first versions were a Python workflow in `workflow/`, kept as the reference.

1. **Import**
2. **Active hours and Lockdown** (the optional Chrome extension)
3. **Reschedule** (scopes, What's wrong, Undo)
4. **Focus mode**
5. **What's wrong and free time**

Cut for the hackathon: sleep screenshots, the sleep questionnaire, the sidebar mic from the sketches. Active hours replace the questionnaire; using browser activity is the owner's call for this demo.

## The app

One Next.js 16 app (App Router, Bun, Biome, Vitest) with Supabase.

- **Data:** Supabase Postgres, schema in `supabase/migrations/`. Tables: `settings` (time zone, active hours, nearby places), `feeds` (one per school), `tasks` (each under its feed), `blocks` (session / break / event), `day_limits` (lighter days), `dismissals` (a task rescheduled from a session waits an hour), `reminders`. Every row belongs to its owner under RLS.
- **Sign-in:** `/login` asks for an email; `/api/login` starts the session (`src/app/api/login/route.ts`). It asks Supabase's admin API for a one-time sign-in token for that email (creating the account the first time; nothing is sent) and verifies it at once as the student, which sets the session cookie. The secret key (`SUPABASE_SECRET_KEY`, server-only, `src/lib/supabase/admin.ts`) is used for that and nothing else; all data is still read and written as the student under RLS. The proxy (`src/proxy.ts` → `src/lib/supabase/proxy.ts`) sends signed-out visitors to `/login?next=…` and answers API calls with 401. Each page also checks the user with the auth server (`requireUser`), which catches a session whose account is gone. A 401 in the app clears the session and goes to `/login`. Sign out is in Options. Anonymous sign-in is off.
- **Session cookie:** the app's own name, `sb-planner-auth-token` (`src/lib/supabase/env.ts`). Renna's local Supabase is also on 127.0.0.1 and browsers share localhost cookies across ports, so the default name let the two apps overwrite each other's sign-in.
- **Local dev:** Supabase runs in OrbStack on its own ports (API 54421, DB 54422, Studio 54423) so it sits beside Renna's. `supabase start`, then `bun run dev`. Keys for dev live in `.env.development.local` (not committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`. After a schema change: `supabase db reset` and `bun run db:types`.
- **Reading and plain writes:** the page loads everything once (`fetchPlanner`, `src/modules/planner/core/queries.ts`) into one TanStack Query cache. Done ticks, events, reminders and active hours are written straight from the browser through RLS, optimistic and in order (`src/modules/planner/ui/planner.tsx`).
- **Model calls and outside services** go through route handlers that check the body and the user: `/api/import`, `/api/reschedule` and `/api/reschedule/undo`, `/api/places`. The API key is server-only (`src/lib/claude.ts`).
- **Time:** code owns it, in the student's time zone, with Temporal (`src/lib/time.ts`). The model never does date math; it picks a day number and an HH:MM, and code checks it.
- **Demo clock:** `?at=HH:MM` on any page pins "now" for today, and Reschedule uses it too.
- **Modules:** `src/modules/<feature>/core` holds plain functions (`import`, `arrange`, `suggest`, `planner`); `src/modules/planner/ui` and `src/modules/extension/ui` hold client hooks; screens are in `src/shell/`.
- **Checks:** `bun run lint && bun run typecheck && bun run test && bun run build`.
- **Mock schools (for demos):** the owner's real feed doesn't show every feature, so the demo runs on two made-up schools. `/mock/state.ics` (Mock State University: 17 entries over five courses, PHYS, ENGL, PSYC, BIOL, MATH) has three things due today including a timed quiz tonight, long work that must spread over days (an essay, two lab reports), quizzes, an exam to prepare for, discussion replies, two title-only locked items, and a past assignment and office hours that must stay out. `/mock/college.ics` (Mock Community College: 4 entries) is the second school, sharing a Canvas id with Mock State. Dates are relative to today (`?tz=` sets the zone), written the way Canvas writes them (`src/modules/import/core/mock.ts`). Paste either link into Options.
- **In the browser:** `bun scripts/e2e-ui.ts` drives Chrome (Playwright, the installed Chrome) through every screen as a new student with a faked extension, then as a second student with none (default hours, no Lockdown, planning still works). Screenshots and the full console log go to `UI_OUT` (default `.e2e-ui/`, not committed). Blocks carry `data-kind` (session, break, event, idea, due) for it. A hydration note about `caret-color` on the login field comes from Playwright hiding the text cursor for screenshots, not from the app.
- **End-to-end:** `bun run e2e` (`scripts/e2e.ts`), with Supabase and the dev server running. It plays real visitors (signing in by email) against the mock schools: the sign-in gate, import by link and upload, two schools, planning the week, Hour (only the next hour's work moves, everything else stays put), "I feel sick today" (a light day the plan keeps to), a wedding tomorrow (a busy block, work moved around it), Undo (everything back exactly), rescheduling from a session ("starving" → a break to eat; "ugh" → nothing), a new shift moving only the session it covers, the hard rules after every change, a done tick, removing a school, the pages, and privacy between students. It costs about a cent of Haiku per run.

## Screens

From the owner's two sketches. Sidebar: Day, Week, Focus, Options (all pages), and "+" (Add block). A first visit with no schools shows the Canvas import on Day.

- **Login** (`Login.tsx`): the app name, one Email field and Continue. Errors show under it.

- **Day** (`DayView`, `Timeline`): the weekday and clock, "Now: …", day navigation, "2/5 done", and Reschedule. Below that, a lighter day's chip (`LimitChip`) and the due assignments, then the day as a horizontal timeline (168px per hour, blocks where they happen, a red now line), then Reminders.
- **Reschedule** (`Reschedule.tsx`, `RescheduleForm.tsx`, `RescheduleResult.tsx`): the header button opens "What's wrong?" (optional), Move: Hour / Day / Week (Week before anything is planned this week, Day after), and Reschedule. Every result, from the header or a session card, opens on the header button: what moved, what the answer changed, minutes that didn't fit, Undo, and Biggest priority.
- **Week** (`WeekView`): FullCalendar's week grid, Sunday first, assignments in the all-day row as "Due", and the same blocks.
- **Block cards** (`Block.tsx`), opened in place:
  - **session:** the task's deliverable, requirements and Canvas link, plus Focus / Done / Reschedule. Reschedule turns the card into the Reschedule form, with Hour chosen.
  - **due:** the same details, with a Done tick.
  - **event:** edit or delete.
  - **break:** delete.
  - **idea:** a tree picture, the place and its distance, and a map link.
- **Focus** (`/focus/[id]`): course and title, a big pomodoro clock (25 on, 5 off), Start/Pause, sound (the Lofi Girl stream in a small player), Done, Leave, and Reminders.
- **Options** (`/options`, `Options.tsx`), its own page: Canvas (`Feeds.tsx`): one row per school with Import again (links) and Remove (asks in place), then a link field with Add, and Upload for an `.ics` file. Hours: 24 bars, learned (green, "Learned from your browser") or default (gray, "Default, 8am to 11pm"), whether the extension is connected, and Refresh when it is. Places ("Find near me"). Account (the email and Sign out).
- **"+":** adds an event (title, date, start, end, details). When a new or edited event covers planned work that hasn't started, Reschedule runs by itself with just that work moving (scope "clash"). The Reschedule button shows it's busy whenever any reschedule is running.
- **Look:** Radix Themes, grass on sage, small radius. Flat: floating cards get a hairline, not a shadow. Block colours by kind: deep sessions grass, light sessions pale grass, breaks amber, events gray, ideas dashed jade, due tomato.
- **Edits:** a draft with Save. Esc with unsaved changes asks "Save changes?". Deletes ask in place with Keep focused.

## Import

Each upcoming assignment becomes a task: title, course, due time, a link to the assignment page, and its interpretation. Pipeline: a feed link or an uploaded `.ics` → read assignments → file them under their school → only new or changed ones go to Claude → check every field → save. Lives in `src/modules/import/core/`: `feed.ts` (read the feed, with ical.js), `interpret.ts` (prompt and schema), `reading.ts` (checks), `run.ts` (the pipeline).

- Feed link, not a Canvas login key: every student has one, and the school doesn't need to approve anything. Uploading the `.ics` works too, but it doesn't update itself.
- Several schools: a feed is named by the Canvas address in its assignment links. A link and a file from the same school land in the same feed, so the same assignments never appear twice. Canvas ids are unique within one school, so a task's key is (feed, uid). Removing a school removes its tasks and their sessions.
- Canvas writes an assignment due at 11:59pm as an all-day date. Code sets it back to 11:59pm in the student's time zone.
- Only assignments come in (UIDs `event-…assignment…-<id>`). Class meetings and personal events are skipped, and so is anything already past due.
- Assignments in locked modules have no text in the feed, so they're interpreted from the title alone.
- Claude Haiku 5.5 at low effort, with a fixed output schema (zod). The model never sees dates. Code drops fields that don't hold: minutes outside 5 to 2,400, empty lines or lines over 160 characters, more than 5 requirements. Gaps stay empty and are never guessed.
- Each assignment is read once per version of its text (fingerprint of course + title + text). An extension alone doesn't cost a model call. A failed read is retried on the next import.
- Reading happens in the background: `/api/import` saves the tasks and answers at once ("15 upcoming"), then `after()` reads the new or changed ones (`readAssignments`) and saves each reading the moment it lands. Up to 32 model calls run at once in a steady pool (`p-limit`); the client retries up to 4 times to ride out rate limits. 78 assignments take about 9 seconds.
- While a just-imported school (within 3 minutes, `READING_WINDOW_MS`) has unread tasks, the page checks back every second. Its row in Options shows "Reading n of N" with a growing bar and a quiet sweep, the Day and Week headers show the total the same way (`Reading.tsx`, `ReadingAll.tsx`), and unread Due chips pulse slowly. Motion tokens live in `globals.css`; with reduced motion the sweep and pulse stop.

## Active hours

The extension is optional: nothing in the app requires or asks for it. Without it, plans use default hours (`src/modules/arrange/core/hours.ts`: 8am to 11pm, none preferred), and the planner's prompt says the hours aren't known yet. When connected it unlocks usage pattern learning (below) and Lockdown in focus mode. The app checks once per page load with a `ping` (`extensionPresent`, `useExtension` in `bridge.ts`).

The extension (`extension/`, Manifest V3, plain JS) reads the last 28 days of Chrome history, so it has data on day one with no background tracking. Only this device's visits count. For each hour, the share of those days with any visit in that hour gives 24 numbers. The math is in `activity.js`.

The app asks for them on every load through the content script (`content.js` ↔ `src/modules/extension/ui/bridge.ts`, with no extension id needed) and saves them when they change. Clicking the toolbar button still saves `activity.json` to Downloads for the Python workflow. Install: chrome://extensions → Developer mode → Load unpacked → `extension/`. The content script matches `localhost:3000` and `127.0.0.1:3000`; add the deployed address there when the app goes online.

## Reschedule

Pipeline: "What's wrong?" → Haiku (low effort) turns the answer into changes in a fixed schema → `checkChanges` keeps what holds → saved (a lighter day in `day_limits`, a busy time as an event block, a break) → the scope picks which sessions may move → one Haiku call (medium effort) places them, as task id + day number + HH:MM + minutes → `check` drops every session that breaks a hard rule → the moved sessions are replaced. Lives in `src/modules/arrange/core/`: `plan.ts` (the week, the rules, `check`, the prompt text) and `arrange.ts` (`reschedule`, `undoReschedule`); the answer step in `src/modules/suggest/core/` (`understand.ts`, `changes.ts`, `rest.ts`). Planning a whole week takes about 30 seconds; an Hour or Day reschedule about 10.

- **The week:** today (from the next quarter hour) through Saturday (`weekFrom`). Tasks due within 14 days are considered, but nothing is placed past Saturday.
- **Scopes** (what may move): Hour: sessions overlapping the next hour, which then can't start before it ends. Day: today's remaining sessions, including one under way. Week: every future session this week. Clash (automatic, after adding an event): just the sessions under it. Whatever the scope, a busy time or lighter day from the answer also moves the sessions it touches. With Hour, Day and Clash each task may place only the minutes that moved (`allowance`); other sessions are busy times that stay put. A session the student rescheduled from always moves, and its task waits an hour.
- **What the model sees:** each task's title, course, one-line deliverable, due time, minutes to place and deep/light; each day's open time, busy times and lighter-day limit; the active hours; the plan before (to keep steady); and the scope's instruction, last.
- **Undo:** every reschedule returns exactly what it changed (sessions removed, blocks and limits added, a limit it replaced). `/api/reschedule/undo` puts it back, as the student under RLS.

The prompt carries only time-based research. Retrieval practice (self-testing) is deliberately left out to keep the purpose clear.
- **Deadlines first.**
- **Synchrony effect:** deep work in the hours with the highest active share, light work in lower ones.
- **Spacing:** work over 90 minutes is split across the days before it's due.
- **Switch cost:** one course at a time; change course only after a break.
- **Breaks:** sessions of 25–90 minutes, at least 10 minutes apart.
- **Planning fallacy:** a third of each day's open time stays free, and deep work is capped at 4 hours a day.
- **Fixed busy times:** never overlapped.
- **A lighter day:** keeps within its minutes, and gets no deep work unless it allows it.
- **Steadiness:** place only what's moving, and keep the plan before where possible.

Code checks (`check`): the task exists, the day is this week, the time parses, the session is 10–120 minutes long, inside that day's window, after any wait, ends before the task is due, never in an hour under 10% active, doesn't overlap a busy time or another session, stays within the task's minutes (or what moved), the day's 4-hour deep cap, its lighter-day limit, and its free third.

## What's wrong and free time

Lives in `src/modules/suggest/core/`.

What's wrong (`understand.ts`, `changes.ts`, `rest.ts`): the answer, the time, this hour's active share, minutes worked today, the last break, the session it came from and the week's days go to Haiku (low effort). It returns lighter days (day number, minutes, deep allowed), busy times (day number, HH:MM to HH:MM, a short title in the student's words) and at most one break. `checkChanges` keeps days inside the week, real times still ahead, titles under 60 characters, minutes 0–720, and holds the break to its kind's range. Code writes the words shown ("Today: at most 1h of work, nothing heavy."). The break starts now, or after a session under way when the whole week is planned. Breaks:
- **nap**, 10–20 min: sleepy or drained. Longer naps leave you groggy, and there are no naps after 6pm because they cost night sleep.
- **walk**, 10–30 min: can't focus, restless, stressed. Attention Restoration Theory: time outside restores focus.
- **eat**, 15–40 min: hungry.
- **move**, 5–15 min: stiff, bored, sitting too long.
- **nothing:** vague or empty answers change nothing; the plan just runs in its scope.

Free time (`free-time.ts`): plain code, no model, worked out on display and not saved. Open gaps of 30+ minutes in awake hours get an outdoor idea by the hour:
- **Before noon:** morning light.
- **Until 2pm:** lunch outside, at a park within 1.5 km if there is one.
- **Until 6pm:** a walk to a nearby park, or for gaps of an hour or more a trail, reserve or bigger park.
- **After 6pm:** stepping outside to look at the sky.

At most three a day, on the longest gaps, with each idea used once.

Places (`places.ts`): "Find near me" sends the browser's location to OpenStreetMap's Overpass API (free, no key): named parks, reserves, gardens and hiking routes within 5 km, nearest first, 12 kept in `settings.places`. The public servers are slow (often 30–40 seconds), so it falls back to two mirrors and runs once per location, not on display. When all of them are down the app says so, and free time keeps its ideas without a place.

## Focus mode

`/focus/[id]` (`src/shell/Focus.tsx`): one session in pomodoros (25 minutes on, 5 off, the last trimmed to fit). When the extension is connected, a Lockdown switch shows (on by default): Start then has the extension block entertainment sites (YouTube, TikTok, Instagram, X, Reddit, Facebook, Netflix, Twitch, Hulu, Disney+) until the session would end, and turning it off mid-session lifts the block. Without the extension there's no switch, and focus mode works the same otherwise. It blocks whole-page visits only, so the embedded lofi player still plays. Done, Leave, and leaving the page lift the block. Sidebar "Focus" opens the session under way, or the next one today.

## The Python workflow (reference)

`workflow/` holds the first versions: `importer` (import) and `rearrange` (one day at a time, dismiss, What's wrong, free time), run from the command line with `uv`. It reads `workflow/.env` and saves to `workflow/data/`. The app doesn't use it.
