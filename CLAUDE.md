@AGENTS.md

# Project

A day planner for college students on Canvas. It turns their assignments into a plan that fits their body clock, then helps them focus through it. Not a todo app, a chatbot, or a Canvas replacement. Hackathon theme: "modern life and/or nature life".

Devices: laptop browser.

## How we build it

It began as a hackathon presentation. On 2026-10-16 the owner moved it to full-effort development: the standards in `~/.claude/CLAUDE.md` apply in full. Where this file and that one differ, this file wins.

- **Models** (the owner's calls): Haiku 5.5 (`claude-haiku-5-5`) for every model call except two, which use Sonnet 5.5 (`claude-sonnet-5-5`) at medium effort: the one-line advice for What's wrong, and planning the day's nature suggestion. No comparing models or effort levels.
- **Mature libraries over hand-rolled UI** (the owner's call): Radix Themes for controls and floating cards, FullCalendar for the week grid, styled from one palette.
- **Sign-in is an email, nothing more** (the owner's call): typing an email identifies the student, new or returning, with no code or password. Anyone who types an email gets that planner, which is fine for demos and not for real students.

## Words

- **assignment**: what Canvas gives us.
- **task**: an assignment after import, with its interpretation.
- **import**: a Canvas calendar feed → tasks.
- **feed**: one school's Canvas, named by its address ("deanza.instructure.com"). A student can have several, each from a feed link or an uploaded `.ics` file.
- **interpretation**: what the model reads from one assignment: the deliverable (what to hand in), requirements, minutes (the time estimate) and work (`deep` or `light`). "Focus" is kept for focus mode.
- **body clock**: when the student sleeps, their **chronotype** (early, middle or late type) and their **alertness** hour by hour, with the **sharpest** hours marked. Learned from browser history by the optional extension ("usage pattern learning"), or set as a **morning person** or **night person**; until then a default of 11pm to 8am.
- **active hours**: the share of recent days the browser was used in each hour. Only the extension popup's bars show it now; planning uses the body clock.
- **extension**: the Chrome extension. Optional: the app never requires or asks for it. When connected it unlocks usage pattern learning and **Lockdown**.
- **lockdown**: with Lockdown on in Options (its only switch, off by default), distracting sites are blocked whenever a session is under way by the plan, or while focus mode runs on any task (working ahead of schedule counts). Haiku judges each site once (study, distraction or unsure); only distractions are blocked. Needs the extension.
- **block**: anything on the calendar: a session, a break, an event, or a nature suggestion.
- **session**: a stretch of time on one task, with a start and minutes.
- **event**: the student's own block, added with "+" (a class, a shift at work).
- **week**: the school week, Sunday to Saturday ("that's how school works"). A plan covers today through Saturday; on Sunday the next week starts.
- **reschedule**: the one way to (re)plan: it asks "What's wrong?" and how much may move (**scope**), then plans. ("Rearrange" is retired.)
- **preferences**: how the student likes to work, set in Options, each a pair of opposites with Any between, the choices saying what they mean: **Chunking** 25–45 min / 60–90 min, **Start with** Easy work / Hard work, **Breaks** 10 min / 30 min, **Courses a day** One or two / Several, **Finish** Early / Near due, **Weekends** Lighter / Full. They steer the planner over the research guidelines, never over the hard rules.
- **scope**: what may move. **Hour**: only the work in the next hour, pushed after it. **Day**: today's remaining work. **Week**: everything this week. A busy time or lighter day from the answer also moves the work it touches.
- **lighter day**: a day the answer asked to carry less ("I feel sick today"): at most so many minutes, and no deep work unless it says so. Shown as a chip on Day; deletable.
- **biggest priority**: shown with every Reschedule result: the open tasks due soonest, then the most work left. Plain code.
- **reschedule from a session**: a session card's Reschedule. That session moves and its task waits an hour, plus whatever the scope opens up. ("Dismiss" is retired.)
- **what's wrong**: the question Reschedule asks first. The answer can become a lighter day, a **busy time** (one of the student's events, titled in their words: "Brother's wedding"), or a **break** now (nap, walk, eat or move). An empty or vague answer changes nothing.
- **nature suggestion**: one outing a day to a real park, garden, reserve or trail near the student, on top of the plan, with the walk there and back. ("Free time" ideas are retired.)
- **due**: an assignment shown on the day it's due ("assignment block" in the sketches).
- **focus mode**: one session, full screen, in pomodoros of the student's lengths. Entered only from a session's card (focus is per task).

## Functions

All built in the web app. The first versions were a Python workflow in `workflow/`, kept as the reference.

1. **Import**
2. **Body clock and Lockdown** (the optional Chrome extension)
3. **Reschedule** (scopes, What's wrong, Undo)
4. **Focus mode**
5. **What's wrong and nature suggestions**

Cut for the hackathon: sleep screenshots, the sleep questionnaire, the sidebar mic from the sketches. The body clock replaces the questionnaire; using browser activity is the owner's call for this demo ("collect some data to show the judge this kinda works, not trying to be perfect").

## The app

One Next.js 16 app (App Router, Bun, Biome, Vitest) with Supabase.

- **Data:** Supabase Postgres, schema in `supabase/migrations/`. Tables: `settings` (time zone, active hours, nights, morning or night person, preferences, Lockdown and the pomodoro's lengths, nearby places), `feeds` (one per school), `tasks` (each under its feed), `blocks` (session / break / event / nature, a nature one carrying its place), `day_limits` (lighter days), `dismissals` (a task rescheduled from a session waits an hour). Reminders were removed (the owner's call). Every row belongs to its owner under RLS.
- **Sign-in:** `/login` asks for an email; `/api/login` starts the session (`src/app/api/login/route.ts`). It asks Supabase's admin API for a one-time sign-in token for that email (creating the account the first time; nothing is sent) and verifies it at once as the student, which sets the session cookie. The secret key (`SUPABASE_SECRET_KEY`, server-only, `src/lib/supabase/admin.ts`) is used for that and nothing else; all data is still read and written as the student under RLS. The proxy (`src/proxy.ts` → `src/lib/supabase/proxy.ts`) sends signed-out visitors to `/login?next=…` and answers API calls with 401. Each page also checks the user with the auth server (`requireUser`), which catches a session whose account is gone. A 401 in the app clears the session and goes to `/login`. Sign out is in Options. Anonymous sign-in is off.
- **Session cookie:** the app's own name, `sb-planner-auth-token` (`src/lib/supabase/env.ts`). Renna's local Supabase is also on 127.0.0.1 and browsers share localhost cookies across ports, so the default name let the two apps overwrite each other's sign-in.
- **Local dev:** Supabase runs in OrbStack on its own ports (API 54421, DB 54422, Studio 54423) so it sits beside Renna's. `supabase start`, then `bun run dev`. Keys for dev live in `.env.development.local` (not committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`. After a schema change: `supabase db reset` and `bun run db:types`.
- **Reading and plain writes:** the page loads everything once (`fetchPlanner`, `src/modules/planner/core/queries.ts`) into one TanStack Query cache. Done ticks, events, preferences, focus settings and what the extension learned are written straight from the browser through RLS, optimistic and in order (`src/modules/planner/ui/planner.tsx`).
- **Model calls and outside services** go through route handlers that check the body and the user: `/api/import`, `/api/reschedule` and `/api/reschedule/undo`, `/api/places` (which also plans the week's nature suggestions), and for the extension `/api/site` (Lockdown's site check), `/api/status` (who's signed in) and `/api/lockdown` (the setting and the session under way). The API key is server-only (`src/lib/claude.ts`). A network failure reads "Couldn't reach Planner. Try again."; a 401 clears the session and goes to `/login`.
- **Time:** code owns it, in the student's time zone, with Temporal (`src/lib/time.ts`). The model never does date math; it picks a day number and an HH:MM, and code checks it.
- **Demo clock:** `?at=HH:MM` on any page pins "now" for today, and Reschedule uses it too.
- **Modules:** `src/modules/<feature>/core` holds plain functions (`import`, `arrange`, `suggest`, `planner`); `src/modules/planner/ui` and `src/modules/extension/ui` hold client hooks; screens are in `src/shell/`.
- **Checks:** `bun run lint && bun run typecheck && bun run test && bun run build`.
- **Mock schools (for demos):** the owner's real feed doesn't show every feature, so the demo runs on two made-up schools. `/mock/state.ics` (Mock State University: 17 entries over five courses, PHYS, ENGL, PSYC, BIOL, MATH) has three things due today including a timed quiz tonight, long work that must spread over days (an essay, two lab reports), quizzes, an exam to prepare for, discussion replies, two title-only locked items, and a past assignment and office hours that must stay out. `/mock/college.ics` (Mock Community College: 4 entries) is the second school, sharing a Canvas id with Mock State. Dates are relative to today (`?tz=` sets the zone), written the way Canvas writes them (`src/modules/import/core/mock.ts`). For the presentation everything upcoming falls in this calendar week, and timed quizzes are due in the evening so a demo at any hour keeps them: the entries are written over ten days and squeezed, in order, into today through Saturday, so on a Sunday they spread over the whole week and late in the week they crowd its last days. Paste either link into Options.
- **In the browser:** `bun scripts/e2e-ui.ts` drives Chrome (Playwright, the installed Chrome) through every screen as a new student with a faked extension (active hours and a late sleeper's nights), then as a second student with none (the default body clock, planning still works). It checks, among the rest: no Reminders, no sidebar Focus, Lockdown only in Options, the body clock sentence, at most one nature suggestion a day and its card (map, walk, Directions on foot). Screenshots and the full console log go to `UI_OUT` (default `.e2e-ui/`, not committed). Blocks carry `data-kind` (session, break, event, nature, due) for it. A hydration note about `caret-color` on the login field comes from Playwright hiding the text cursor for screenshots, not from the app. The extension itself is tested in Playwright's bundled Chromium (installed Chrome refuses to load an unpacked extension that way).
- **End-to-end:** `bun run e2e` (`scripts/e2e.ts`), with Supabase and the dev server running. It plays real visitors (signing in by email) against the mock schools: the sign-in gate, import by link and upload, two schools, planning the week, Hour (only the next hour's work moves, everything else stays put), "I feel sick today" (a light day the plan keeps to), a wedding tomorrow (a busy block, work moved around it), Undo (everything back exactly), rescheduling from a session ("starving" → a break to eat; "ugh" → nothing), a new shift moving only the session it covers, the hard rules after every change, a done tick, removing a school, the pages, and privacy between students. It works out what each mock school holds from the feed as it parses at that moment (the week is squeezed, so the counts change with the day), and costs about a cent of Haiku per run.

## Screens

From the owner's two sketches. Sidebar: Day, Week, Options (all pages), and "+" (Add block). Focus isn't in it: focus is per task, entered from a session's card. A first visit with no schools shows the Canvas import on Day.

- **Login** (`Login.tsx`): the app name, one Email field and Continue. Errors show under it.

- **Day** (`DayView`, `Timeline`): fills the screen. The weekday and clock, with day navigation, "2/5 done" and Reschedule on the same line, and "Now: …" under it. Then a lighter day's chip (`LimitChip`) and the due assignments, then the day as a horizontal timeline (168px per hour) taking the rest of the height: hour lines and a red now line run top to bottom, and the blocks sit in one band a little above the middle (as tall as 32% of the screen, shared when blocks overlap), each where it happens. What's over steps back. Blocks under 90px show when they start instead of their range. Ranges are written short ("5:20–6:00pm", `clockRange` in `src/lib/time.ts`).
- **Reschedule** (`Reschedule.tsx`, `RescheduleForm.tsx`, `RescheduleResult.tsx`): the header button opens "What's wrong?" (optional), Move: Hour / Day / Week (Week before anything is planned this week, Day after), and Reschedule. Every result, from the header or a session card, opens on the header button: a line of advice on the answer (when there is one), what moved, what the answer changed, minutes that didn't fit, Undo, and Biggest priority.
- **Week** (`WeekView`): FullCalendar's week grid, Sunday first, assignments in the all-day row as "Due", and the same blocks. A block of 40 minutes or less shows its title and time on one line; overlapping blocks sit side by side.
- **Block cards** (`Block.tsx`), opened in place, beside the block (to its right, flipping left near the edge; never taller than the screen):
  - **session:** the task's deliverable, requirements and Canvas link, plus Focus / Done / Reschedule. Reschedule turns the card into the Reschedule form, with Hour chosen.
  - **due:** the same details, with a Done tick.
  - **event:** edit or delete.
  - **break:** delete.
  - **nature:** a small map with the walking route (`NatureMap.tsx`), the place, its time, "N min walk each way, M min there", Directions (on foot) and Delete.
- **Focus** (`/focus/[id]`, `Focus.tsx`): the course and title at the top left, Leave at the top right; in the middle a big clock, "Focus 1 of 3" or "Rest", a thin bar per pomodoro and rest filling as they pass, then Start / Pause / Resume, Done and sound (Lofi Girl's live stream, whichever is on now, in a small player). Time fills the screen from the ground up: behind everything, a field in the course's color rises while you work and sinks back in green while you rest (transform only, a second at a time). Space starts and pauses; the tab title shows the time left.
- **Options** (`/options`, `Options.tsx`), its own page: Canvas (`Feeds.tsx`): one row per school with Import (links: read it again) and Remove (asks in place), then a link field with Add, and Upload for an `.ics` file. Body clock (see Body clock): the sentence, the alertness bars, where it comes from, Morning · Any · Night, whether the extension is connected, and Refresh when it is. Preferences: one row per preference with an opposite · Any · opposite control (the same control as Reschedule's Move), saved at once. Focus: Lockdown (a switch, "Needs the extension" beside it when there's none; the only place Lockdown is set), Work 25 / 50 / 90 min and Break 5 / 10 / 15 min. Account (the email and Sign out). There's no Places section: places are found on Reschedule.
- **"+":** adds an event (title, date, start, end, details). When a new or edited event covers planned work that hasn't started, Reschedule runs by itself with just that work moving (scope "clash"). The Reschedule button shows it's busy whenever any reschedule is running.
- **Course colors:** every block is one solid color, with no border. A session and a due chip take their course's color: the student's courses, in alphabetical order, take eight colors in turn (`courseColors` in `src/modules/planner/core/courses.ts`, `useCourseColor`; tokens `--course-1` to `--course-8` in `globals.css`, all at the same OKLCH lightness so the ink reads on each). Events are gray, breaks warm gray, nature suggestions dark green (`--event`, `--break`, `--idea`). Done work and what's over are dimmed.
- **Look:** dark only, minimal, in Renna's manner (`src/app/globals.css`, `src/app/layout.tsx`): ink (#ececec) on a near-black sheet (#181818), Geist, nothing heavier than medium weight, small radius. Radix Themes in dark with a neutral gray accent; solid buttons are ink with dark text, and the focus ring is a quiet gray. Sidebar items are plain words, the current page in ink. Flat: floating cards get a gray edge (#3d3d3d), not a shadow. Color only where it means something: the course colors above and the now line.
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

## Body clock

When the student sleeps, their chronotype, and how alert they are through the day. Plain code, no model: `src/modules/arrange/core/body-clock.ts` (`bodyClockOf`, `describe`). Pipeline: browser history → each night's longest gap in browsing → usual sleep and wake times → middle of sleep on free days = chronotype → an alertness curve hour by hour → the planner.

- **Nights** (`sleepTimes` in `extension/activity.js`): for each of the last 28 mornings, the longest gap with no visits between 6pm the day before and 2pm, when it's at least 3 hours with a visit on both sides. Its start stands for falling asleep and its end for getting up (the first visit comes a little after waking, so it runs late; good enough for the demo). Saved in `settings.nights`, as minutes from that morning's midnight.
- **Learned** from at least 5 nights: the median sleep and wake times. **Chronotype** is the median middle of sleep on Saturday and Sunday mornings (all nights if fewer than two), as in the Munich Chronotype Questionnaire: before 3:30am early, after 5am late, else middle.
- **Set by the student:** Morning (10pm to 6am) or Night (2am to 10am), in `settings.clock`; it wins over what was learned. **Default** without either: 11pm to 8am.
- **Alertness:** the Three-Process Model of Alertness (Åkerstedt & Folkard). Sleep pressure builds from waking, a 24-hour rhythm peaks in the afternoon and shifts with chronotype, and grogginess fades in the first hour. It's scaled to 10–100 for awake hours, 0 asleep. **Sharpest** is the stretch around the peak within 5% of it.
- **Shown** in Options: "Up around 9:30am, asleep around 1:30am · Late type · Sharpest 2pm–8pm", the 24 bars with the sharpest in ink, where it comes from ("From your browser, 14 nights", "Set by you", "Default"), and Morning · Any · Night.
- **Used** by the planner in place of the old active hours: the prompt gets the sentence and the 24 values, deep work goes to the most alert hours, and `check` never places a session in an hour marked 0. What's wrong gets this hour's alertness.

The extension is optional: nothing in the app requires or asks for it. The app checks once per page load with a `ping` (`extensionPresent`, `useExtension` in `bridge.ts`), and on every load asks for what it learned (`activityFromExtension`), saving the active hours and nights when they change. Only this device's visits count, read from history on demand with no background tracking. Install: chrome://extensions → Developer mode → Load unpacked → `extension/`. The content script matches `localhost:3000` and `127.0.0.1:3000`; add the deployed address there when the app goes online.

## Reschedule

Pipeline: "What's wrong?" → Haiku (low effort) turns the answer into changes in a fixed schema → `checkChanges` keeps what holds → saved (a lighter day in `day_limits`, a busy time as an event block, a break) → the scope picks which sessions may move → one Haiku call (medium effort) places them, as task id + day number + HH:MM + minutes → `check` drops every session that breaks a hard rule → the moved sessions are replaced. Lives in `src/modules/arrange/core/`: `plan.ts` (the week, the rules, `check`, the prompt text) and `arrange.ts` (`reschedule`, `undoReschedule`); the answer step in `src/modules/suggest/core/` (`understand.ts`, `changes.ts`, `rest.ts`). Planning a whole week takes about 30 seconds; an Hour or Day reschedule about 10.

- **The week:** today (from the next quarter hour) through Saturday (`weekFrom`). Tasks due within 14 days are considered, but nothing is placed past Saturday. The result's "didn't fit" counts the minutes still owed to tasks due by Saturday (for Week as well as the narrower scopes).
- **Scopes** (what may move): Hour: sessions overlapping the next hour, which then can't start before it ends. Day: today's remaining sessions, including one under way. Week: every future session this week. Clash (automatic, after adding an event): just the sessions under it. Whatever the scope, a busy time or lighter day from the answer also moves the sessions it touches. With Hour, Day and Clash each task may place only the minutes that moved (`allowance`); other sessions are busy times that stay put. A session the student rescheduled from always moves, and its task waits an hour.
- **What the model sees:** each task's title, course, one-line deliverable, due time, minutes to place and deep/light; each day's open time, busy times and lighter-day limit; the body clock (the sentence and alertness by hour); the student's preferences; the plan before (to keep steady); and the scope's instruction, last.
- **Preferences** (`src/modules/arrange/core/preferences.ts`): a registry of pairs, each choice one line of the planner's prompt ("Long sessions: 60 to 90 minutes each, fewer of them."). The system prompt ranks them above the research guidelines and below the hard rules; they aren't checked in code, since they're wishes. Saved in `settings.preferences`; a new preference is one more entry in the registry. Tried on one week: Long gave 8 sessions with a median of 60 minutes, Short 17 with a median of 30.
- **Undo:** every reschedule returns exactly what it changed (sessions removed, blocks and limits added, a limit it replaced). `/api/reschedule/undo` puts it back, as the student under RLS. Undo also takes back the hour-long wait a session's Reschedule set. A reschedule that fails midway takes back what it had already saved (lighter day, busy time, break, wait), so nothing is left half done.

The prompt carries only time-based research. Retrieval practice (self-testing) is deliberately left out to keep the purpose clear.
- **Deadlines first.**
- **Synchrony effect:** deep work in the student's most alert hours, light work in lower ones (from the body clock).
- **Spacing:** work over 90 minutes is split across the days before it's due.
- **Switch cost:** one course at a time; change course only after a break.
- **Breaks:** sessions of 25–90 minutes, at least 10 minutes apart.
- **Planning fallacy:** a third of each day's open time stays free, and deep work is capped at 4 hours a day.
- **Fixed busy times:** never overlapped.
- **A lighter day:** keeps within its minutes, and gets no deep work unless it allows it.
- **Steadiness:** place only what's moving, and keep the plan before where possible. The student's preferences outrank steadiness (otherwise a Week plan would never change shape for them).

Code checks (`check`): the task exists, the day is this week, the time parses, the session is 10–120 minutes long, inside that day's window, after any wait, ends before the task is due, never while asleep (alertness 0), doesn't overlap a busy time or another session, stays within the task's minutes (or what moved), the day's 4-hour deep cap, its lighter-day limit, and its free third.

## What's wrong

Lives in `src/modules/suggest/core/`.

What's wrong (`understand.ts`, `changes.ts`, `rest.ts`): the answer, the time, this hour's alertness, minutes worked today, the last break, the session it came from and the week's days go to Haiku (low effort). It returns lighter days (day number, minutes, deep allowed), busy times (day number, HH:MM to HH:MM, a short title in the student's words) and at most one break. `checkChanges` keeps days inside the week, real times still ahead, titles under 60 characters, minutes 0–720, and holds the break to its kind's range. Code writes the words shown ("Today: at most 1h of work, nothing heavy."). The break starts now, or after a session under way when the whole week is planned. Breaks:
- **nap**, 10–20 min: sleepy or drained. Longer naps leave you groggy, and there are no naps after 6pm because they cost night sleep.
- **walk**, 10–30 min: can't focus, restless, stressed. Attention Restoration Theory: time outside restores focus.
- **eat**, 15–40 min: hungry.
- **move**, 5–15 min: stiff, bored, sitting too long.
- **nothing:** vague or empty answers change nothing; the plan just runs in its scope.

**Advice** (`advice.ts`, `advise.ts`): beside the reschedule, Sonnet 5.5 (medium effort) writes one practical line for this person at this hour, pointing to an option they may have forgotten: sleep now, eat a real meal, the campus health center, emailing the professor or TA for an extension, office hours. It gets the weekday and time, alertness this hour, the body clock in words, minutes worked today, the session it came from and the rest of today; the answer comes last. It never diagnoses, cheers or says the plan moved. Anything that sounds like an emergency points to the local emergency number, or 988 in the US for a crisis. The prompt asks for at most 18 words; code keeps one trimmed line of at most 140 characters and 24 words, else nothing. An empty answer makes no call, and a vague one gets an empty line, so nothing shows. `/api/reschedule` runs it in parallel with `reschedule()`, so it adds no wait; a failure only means no advice. It isn't saved: it shows as the first line of the Reschedule result. Tried live: "i am sick" at 1am → "Go to sleep now, and if you still feel sick in the morning, call the campus health center."

## Nature suggestions

One outing a day to a real place near the student, on top of the plan. Pipeline: Reschedule asks the browser where the student is (the browser asks permission the first time; `useNearbyPlaces`) → when nothing is saved yet, or they've moved more than 3 km, places are found in the background (`/api/places`): OpenStreetMap's Overpass API (free, no key; named parks, reserves, gardens and hiking routes within 5 km, not sports grounds; three servers, as they're often slow; the 12 kept are the nearest, with four kept for the nearest trails, reserves and gardens so a light day can get a bigger place) → each place's walk from there (FOSSGIS foot routing, `walk.ts`, the server openstreetmap.org itself uses; the public OSRM demo isn't used because it returns car times whatever the profile; a 429 is retried once; when FOSSGIS is down, straight line × 1.3 at 5 km/h, marked "About") → 12 saved in `settings.places` → for the days that need one, code works out the free gaps (after now, between sessions, events and breaks, never other nature suggestions, while awake) → Sonnet 5.5 at medium effort picks a place, a start and a stay (15–90 min) per day, with closer places or shorter stays on heavy days (`nature.ts`, `nature-pick.ts`) → `checkNature` keeps a pick only if the walk there, the stay and the walk back fit one gap and end by sunset at the place (suncalc) and by 20:30; a day where nothing fits gets none → saved as a `nature` block with its place (`nature-run.ts`, `refreshNature`).

- **Never blocking:** Reschedule doesn't treat nature suggestions as busy, and a new event over one replans that day (scope clash, even with no work under it). A day whose outing has already started keeps it and gets no second one. A failed nature refresh never fails the reschedule. After it places the work, the days it changed (every day for Week) get their not-yet-started nature suggestions replaced (`refreshNature`). Undo puts the old ones back exactly.
- **The map:** a small still map (react-leaflet, Esri Dark Gray Canvas tiles, which need no key) with the walking route from where the student searched. The route is fetched once per pair and shared by the preview and the card. Pointing at a nature block shows it as a preview (a Radix hover card: the map edge to edge, the place's name under it; hidden while the card is open), after Altay's map location preview; the card shows it too. Directions open openstreetmap.org on foot (`engine=fossgis_osrm_foot`).
- **Altay's map test** (branch `mapIntegration`: `MapTest.html`, `MapTest.js`, a standalone page listing nearby parks and trails with a hover map preview and the route) is where the map preview and walking route came from. It's merged into `main` with its author kept, and lives at the root, outside our formatter. Its routing server (the public OSRM demo) and directions engine (`osrm_foot`) gave car times; both now walk, in his page and in the app.

## Focus mode

`/focus/[id]` (`src/shell/Focus.tsx`): one session in pomodoros of the student's lengths (Options → Focus: Work 25 / 50 / 90 min, Break 5 / 10 / 15; `settings.focus_minutes`, `break_minutes`). A rest left over at the very end is dropped (`pomodoros`). Entered only from a session's card. Focus mode always tells the extension when it starts or resumes (`{ type: "focus", seconds, title, course }`, `seconds` being what's left of the whole session) and when it pauses or ends (`unfocus`); whether that blocks anything is the Lockdown setting in Options. Whole-page visits only are blocked, so the embedded lofi player still plays. Done waits for the save, then tells the extension (`sync`), so Lockdown lifts at once; the Options switch also tells it after saving. Closing the focus tab, or opening a fresh focus page, ends focus mode in the extension.

## The extension

`extension/` (Manifest V3, plain JS, "Planner" 0.7.0). Its pages use the app's look (`ui.css`: the dark tokens from `globals.css`, Geist bundled under its OFL licence in `fonts/`).

- **When:** the extension keeps the focus state the app sends and asks the app every minute, on each app page load, on focus or unfocus, and on `sync` (sent when the Options switch changes) through `GET /api/lockdown`: the setting, and the not-done session under way now (`sessionCovering` in `src/modules/extension/core/lockdown.ts`, read as the student under RLS; `?at=` honoured). It blocks when the setting is on and focus mode runs or a session is under way, until the later of the two ends. The app asks on every page load too (with `activity`), so a session that starts is caught at once. **A blocked visit goes to the app's own focus page** (`toFocus`), for the focus session if focus mode runs, else the session under way (its block id comes with `focus` and from `/api/lockdown`). If a focus page is already open, it comes forward and the blocked page goes back itself (`history.back()`); the tab closes when it has no earlier page, was swept, or just bounced, so it can't loop. When Lockdown starts, tabs already open on a distraction are closed and focus comes forward (`sweep`); sites not judged yet are asked about in the background, and their tabs are touched only if the answer is a distraction, so a study tab never reloads. If the app can't be reached, nothing is blocked. The bridge passes the page's `?at=` with every request.
- **Lockdown, site by site:** while Lockdown blocks, every whole-page visit is judged by its hostname ("youtube.com", without "www."). The app's own address and local addresses are never judged. A site not judged yet goes first to the blocked page, which shows only its name, pulsing, while the extension asks the app (`/api/site`, as the signed-in student) → Haiku 5.5, no thinking, low effort, one word in a fixed schema: study, distraction or unsure (`src/modules/extension/core/site.ts` and `judge.ts`; code keeps only those three words) → the verdict is kept in the extension for good, so each site is asked about once (about 1–2 seconds, a fraction of a cent). Study and unsure sites go on to the page; a distraction goes to focus. Known distractions are redirected before they load (a declarativeNetRequest redirect rule, which is why the extension asks for access to all sites). If the app can't be reached, or the student is signed out, or the model call fails, the site stays open for the rest of that Lockdown (nothing is kept).
- **The way through** (`blocked.html`): no focus screen of its own. A site not judged yet waits there briefly, showing only its name, pulsing, while Haiku answers; a known distraction passes through it on its way to the app's focus page. When Lockdown lifts while it's asking, the tab goes on to the site.
- **The popup** (toolbar button, `popup.html`): Status (Connected with the email, Signed out, or Can't reach Planner, from `/api/status`), Lockdown (Off when the setting is off, On when nothing is under way, Blocking until 4:44pm), the 24 hour bars learned from this browser (drawn like Hours in Options), and Open Planner.
- **Where the app is:** the extension learns the app's address from the app's own messages (default `http://localhost:3000`).

## The Python workflow (reference)

`workflow/` holds the first versions: `importer` (import) and `rearrange` (one day at a time, dismiss, What's wrong, free time), run from the command line with `uv`. It reads `workflow/.env` and saves to `workflow/data/`. The app doesn't use it.
