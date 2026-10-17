// End-to-end check against the dev server and local Supabase, as real visitors
// using the mock schools (/mock/state.ics, /mock/college.ics).
//
//   bun run e2e        (with `supabase start` and `bun run dev` running)
//
// Covers import (links, upload, two schools sharing Canvas ids), Reschedule's
// hard rules, events, dismiss with What's wrong, done ticks, removing a
// school, the pages, and that one student can't see or change another's rows.

import { Temporal } from "temporal-polyfill";
import { bodyClockOf } from "../src/modules/arrange/core/body-clock";
import { parseFeed } from "../src/modules/import/core/feed";
import { mockFeed } from "../src/modules/import/core/mock";
import { APP, Visitor } from "./visitor";

const TZ = "America/Los_Angeles";
// What the extension learns: a late sleeper, about 1:30am to 9:30am.
const NIGHTS = Array.from({ length: 14 }, (_, i) => ({
  date: Temporal.Now.plainDateISO(TZ).subtract({ days: i }).toString(),
  asleep: 75 + (i % 3) * 15,
  up: 555 + (i % 2) * 30,
}));
const HOURS = bodyClockOf({ nights: NIGHTS }).hours;

const failures: string[] = [];
function check(ok: boolean, what: string) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
  if (!ok) failures.push(what);
}

const local = (iso: string) =>
  Temporal.Instant.from(iso).toZonedDateTimeISO(TZ);
const today = Temporal.Now.plainDateISO(TZ);

/** A student signs in by typing a fresh email: no code, nothing sent. */
async function arrive() {
  const visitor = new Visitor();
  check(
    (await visitor.get("/day")) === 307,
    "signed out, /day sends you to /login",
  );
  const email = `student-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.edu`;
  const [status] = await visitor.post("/api/login", { email });
  check(status === 200, `${email} signs in with just the email`);
  check((await visitor.get("/day")) === 200, "and opens Day");
  const [again] = await new Visitor().post("/api/login", { email });
  check(again === 200, "the same email signs in again from another browser");
  return visitor;
}

/** Wait for the background reading: true once `count` tasks are read. */
async function allRead(v: Visitor, count: number, seconds = 90) {
  for (let i = 0; i < seconds; i++) {
    const { data } = await v.db.from("tasks").select("read");
    if ((data ?? []).filter((t) => t.read).length >= count) return true;
    await new Promise((wait) => setTimeout(wait, 1000));
  }
  return false;
}

/** Every imported school's new work has been planned on its own. */
async function allPlanned(v: Visitor, seconds = 240) {
  for (let i = 0; i < seconds; i++) {
    const { data } = await v.db.from("feeds").select("imported_at, planned_at");
    if (
      (data ?? []).every(
        (f) =>
          !f.imported_at ||
          (!!f.planned_at &&
            Date.parse(f.planned_at) >= Date.parse(f.imported_at)),
      )
    )
      return true;
    await new Promise((wait) => setTimeout(wait, 1000));
  }
  return false;
}

async function sessionsHold(v: Visitor, label: string, hours = HOURS) {
  const { data: blocks = [] } = await v.db
    .from("blocks")
    .select("*")
    .order("start");
  const { data: tasks = [] } = await v.db.from("tasks").select("*");
  const byId = new Map((tasks ?? []).map((t) => [t.id, t]));
  const all = (blocks ?? []).map((b) => ({
    b,
    start: local(b.start),
    end: local(b.start).add({ minutes: b.minutes }),
  }));
  // The hard rules hold for planned work; what's done is the week so far.
  const sessions = all.filter(({ b }) => b.kind === "session" && !b.done);

  const overlaps = all.filter(
    (x, i) =>
      i > 0 && x.start.epochMilliseconds < all[i - 1].end.epochMilliseconds,
  );
  const late = sessions.filter(
    ({ b, end }) =>
      end.epochMilliseconds > Date.parse(byId.get(b.task_id ?? "")?.due ?? ""),
  );
  const asleep = sessions.filter(({ start, end }) => {
    const last = end.subtract({ minutes: 1 }).hour;
    for (let h = start.hour; h <= last; h++) if (hours[h] < 10) return true;
    return false;
  });
  const deep = new Map<string, number>();
  for (const { b, start } of sessions) {
    if (byId.get(b.task_id ?? "")?.work !== "deep") continue;
    const day = start.toPlainDate().toString();
    deep.set(day, (deep.get(day) ?? 0) + b.minutes);
  }
  const forDone = sessions.filter(
    ({ b }) => byId.get(b.task_id ?? "")?.done && !b.done,
  );

  check(sessions.length > 0, `${label}: ${sessions.length} sessions placed`);
  check(overlaps.length === 0, `${label}: nothing overlaps`);
  check(
    late.length === 0,
    `${label}: every session ends before its task is due`,
  );
  check(asleep.length === 0, `${label}: no session while asleep`);
  check(
    [...deep.values()].every((m) => m <= 240),
    `${label}: deep work ≤ 4h a day (max ${Math.max(0, ...deep.values())}m)`,
  );
  check(forDone.length === 0, `${label}: no sessions for tasks marked done`);
  for (const { b, start, end } of all) {
    const name = byId.get(b.task_id ?? "")?.title ?? b.title ?? b.rest;
    const day = start.toLocaleString("en-US", { weekday: "short" });
    console.log(
      `         ${day} ${start.toPlainTime().toString().slice(0, 5)}–${end.toPlainTime().toString().slice(0, 5)}  ${b.kind.padEnd(7)} ${name}`,
    );
  }
}

async function main() {
  console.log("Sign-in");
  const stranger = await fetch(`${APP}/api/import`, {
    method: "POST",
    body: "{}",
  });
  check(
    stranger.status === 401,
    `an API call without a session is refused (${stranger.status})`,
  );
  check((await fetch(`${APP}/login`)).status === 200, "the login screen opens");
  check(
    (await fetch(`${APP}/mock/state.ics`)).status === 200,
    "mock feeds stay public",
  );

  console.log("Import");
  const a = await arrive();
  const link = (school: string) => ({
    timeZone: TZ,
    source: { kind: "link", url: `${APP}/mock/${school}.ics?tz=${TZ}` },
  });
  // What each mock school holds right now: items timed earlier today are
  // already past, so the counts come from the feed as it parses at this moment.
  // A mock school also brings this week so far (done), so it saves and reads
  // everything due since Sunday.
  const upcomingOf = (school: "state" | "college") =>
    parseFeed(mockFeed(school, today, TZ), TZ, new Date());
  const sunday = today.subtract({ days: today.dayOfWeek % 7 });
  const weekOf = (school: "state" | "college") =>
    parseFeed(
      mockFeed(school, today, TZ),
      TZ,
      new Date(sunday.toZonedDateTime({ timeZone: TZ }).epochMilliseconds),
    ).length;
  const stateUids = upcomingOf("state").map((x) => x.uid);
  const collegeUids = upcomingOf("college").map((x) => x.uid);
  const sharedUid = stateUids.find((u) => collegeUids.includes(u));
  const nState = stateUids.length;
  const nCollege = collegeUids.length;
  const wState = weekOf("state");
  const wCollege = weekOf("college");
  const total = wState + wCollege;
  check(
    nState > 0 && nCollege > 0,
    `mock schools hold ${nState} + ${nCollege}`,
  );
  let [status, r] = await a.post("/api/import", link("state"));
  check(
    status === 200 &&
      r.school === "mockstate.instructure.com" &&
      r.upcoming === nState,
    `state link: ${JSON.stringify(r)}`,
  );
  check(
    r.reading === wState,
    `state link answers at once, ${wState} to read, this week so far included (${r.reading})`,
  );
  check(
    await allRead(a, wState),
    `state link: all ${wState} read by the model in the background`,
  );
  [status, r] = await a.post("/api/import", link("college"));
  check(
    status === 200 &&
      r.school === "canvas.mockcollege.edu" &&
      r.upcoming === nCollege &&
      r.reading === wCollege,
    `college link: ${JSON.stringify(r)}`,
  );
  const ics = await (await fetch(`${APP}/mock/state.ics?tz=${TZ}`)).text();
  [status, r] = await a.post("/api/import", {
    timeZone: TZ,
    source: { kind: "file", name: "state.ics", ics },
  });
  check(
    status === 200 &&
      r.school === "mockstate.instructure.com" &&
      r.reading === 0,
    `state upload joins the linked school, no new reads: ${JSON.stringify(r)}`,
  );
  check(await allRead(a, total), `college: all ${wCollege} read too`);
  [status] = await a.post("/api/import", {
    timeZone: TZ,
    source: { kind: "file", name: "x.ics", ics: "not a calendar" },
  });
  check(status === 502, `a broken file is refused (${status})`);

  const { data: feeds = [] } = await a.db.from("feeds").select("id, name");
  check(
    feeds?.length === 2,
    `two schools: ${feeds?.map((f) => f.name).join(", ")}`,
  );
  // Nobody pressed Reschedule: the imported work plans itself.
  check(await allPlanned(a), "the imported work is planned on its own");
  const { data: auto = [] } = await a.db
    .from("blocks")
    .select("id")
    .eq("kind", "session");
  check((auto?.length ?? 0) > 0, `${auto?.length} sessions placed on import`);
  // Before the extension's nights arrive: the default body clock.
  await sessionsHold(a, "planned on import", bodyClockOf({}).hours);
  const { data: tasks = [] } = await a.db
    .from("tasks")
    .select("*")
    .order("due");
  check(tasks?.length === total, `${total} tasks (${tasks?.length})`);
  check(
    !!sharedUid && tasks?.filter((t) => t.uid === sharedUid).length === 2,
    `the shared Canvas id (${sharedUid}) exists once per school`,
  );
  check(!!tasks?.every((t) => t.read), "every task has an interpretation");
  for (const t of tasks ?? []) {
    console.log(
      `         ${local(t.due).toPlainDateTime().toString().slice(5, 16)}  ${(t.work ?? "?").padEnd(5)} ${String(t.minutes ?? "?").padStart(4)}m  ${t.title} — ${t.deliverable}`,
    );
  }

  console.log("Reschedule");
  type Moved = {
    moved: number;
    placed: number;
    unplaced: number;
    changes: string[];
    undo: unknown;
  };
  const reschedule = (body: Record<string, unknown>) =>
    a.post<Moved>("/api/reschedule", body);
  const sessionsNow = async () =>
    (await a.db.from("blocks").select("*").eq("kind", "session").order("start"))
      .data ?? [];
  const sameSessions = (x: { id: string }[], y: { id: string }[]) =>
    x
      .map((b) => b.id)
      .sort()
      .join() ===
    y
      .map((b) => b.id)
      .sort()
      .join();

  // The extension is optional: with no nights learned, plans use 8am–11pm.
  let [rs, moved] = await reschedule({ scope: "week", at: "13:00" });
  check(
    rs === 200 && moved.placed > 0,
    `without the extension, the week is planned on default hours (${moved.placed} sessions)`,
  );
  const defaultHours = await sessionsNow();
  check(
    defaultHours.every((b) => {
      const start = local(b.start);
      const end = start.add({ minutes: b.minutes });
      return (
        start.hour >= 8 &&
        (end.hour < 23 || (end.hour === 23 && end.minute === 0))
      );
    }),
    "and every session sits between 8am and 11pm",
  );
  const { error: hoursError } = await a.db
    .from("settings")
    .upsert({ nights: NIGHTS });
  check(
    !hoursError,
    `with the extension, its learned nights are saved through RLS ${hoursError?.message ?? ""}`,
  );
  [rs, moved] = await reschedule({ scope: "week", at: "13:00" });
  check(
    rs === 200 && moved.placed > 0,
    `plan the week from 1pm on the learned body clock: ${JSON.stringify({ ...moved, undo: undefined })}`,
  );
  await sessionsHold(a, "week plan");
  // The plan runs through Saturday of next week.
  const weekEnd = today.add({
    days: 14 - (Temporal.Now.zonedDateTimeISO(TZ).dayOfWeek % 7),
  });
  check(
    (await sessionsNow()).every(
      (b) =>
        Temporal.PlainDate.compare(local(b.start).toPlainDate(), weekEnd) < 0,
    ),
    "nothing is planned past next Saturday",
  );

  console.log("Reschedule: another day");
  let before = await sessionsNow();
  const ahead = before.find(
    (b) =>
      Date.parse(b.start) > Date.now() &&
      !local(b.start).toPlainDate().equals(today),
  );
  if (!ahead) throw new Error("nothing planned after today to reschedule");
  const chosen = local(ahead.start).toPlainDate();
  const onChosen = before.filter((b) =>
    local(b.start).toPlainDate().equals(chosen),
  );
  [rs, moved] = await reschedule({
    scope: "day",
    day: chosen.toString(),
    at: "13:00",
  });
  check(
    rs === 200 && moved.moved === onChosen.length,
    `only ${chosen}'s ${onChosen.length} session(s) move (${moved.moved})`,
  );
  let after = await sessionsNow();
  check(
    sameSessions(
      before.filter((b) => !onChosen.includes(b)),
      after.filter((b) => before.some((x) => x.id === b.id)),
    ),
    "every other session stays exactly where it was",
  );
  await sessionsHold(a, "another day");

  console.log("Reschedule: sick today");
  [rs, moved] = await reschedule({
    scope: "day",
    at: "13:00",
    answer: "I feel sick today",
  });
  check(
    rs === 200,
    `day scope with "I feel sick today": ${JSON.stringify(moved.changes)}`,
  );
  const { data: limitRows = [] } = await a.db.from("day_limits").select("*");
  const sick = limitRows?.find((l) => l.day === today.toString());
  check(!!sick, `today becomes a light day (${JSON.stringify(sick)})`);
  const { data: allTasks = [] } = await a.db.from("tasks").select("id, work");
  const deepTasks = new Set(
    (allTasks ?? []).filter((t) => t.work === "deep").map((t) => t.id),
  );
  const laterToday = (await sessionsNow()).filter(
    (b) =>
      local(b.start).toPlainDate().equals(today) && local(b.start).hour >= 13,
  );
  if (sick) {
    check(
      laterToday.reduce((sum, b) => sum + b.minutes, 0) <= sick.minutes,
      `today's work stays within ${sick.minutes} min`,
    );
    if (!sick.deep)
      check(
        laterToday.every((b) => !deepTasks.has(b.task_id ?? "")),
        "and nothing heavy today",
      );
  }
  await sessionsHold(a, "after a sick day");

  console.log("Reschedule: a wedding tomorrow");
  before = await sessionsNow();
  [rs, moved] = await reschedule({
    scope: "week",
    at: "13:00",
    answer: "my brother's wedding is tomorrow from 3 to 9pm",
  });
  check(
    rs === 200,
    `week scope with a wedding: ${JSON.stringify(moved.changes)}`,
  );
  const tomorrow = today.add({ days: 1 });
  const { data: events = [] } = await a.db
    .from("blocks")
    .select("*")
    .eq("kind", "event");
  const wedding = events?.find((e) => /wedding/i.test(e.title ?? ""));
  check(
    !!wedding &&
      local(wedding.start).toPlainDate().equals(tomorrow) &&
      local(wedding.start).hour === 15 &&
      wedding.minutes === 360,
    `the wedding becomes a busy block tomorrow 3–9pm (${wedding?.title}, ${wedding ? local(wedding.start).toString().slice(0, 16) : "none"}, ${wedding?.minutes} min)`,
  );
  await sessionsHold(a, "around the wedding");

  console.log("Undo");
  const [us] = await a.post("/api/reschedule/undo", moved.undo);
  check(us === 200, `undo answers (${us})`);
  after = await sessionsNow();
  const shape = (
    x: { task_id: string | null; start: string; minutes: number }[],
  ) =>
    x
      .map((b) => `${b.task_id} ${Date.parse(b.start)} ${b.minutes}`)
      .sort()
      .join("|");
  check(
    shape(after) === shape(before),
    "undo puts every session back where it was",
  );
  const { data: eventsAfter = [] } = await a.db
    .from("blocks")
    .select("id")
    .eq("kind", "event");
  check(
    !eventsAfter?.some((e) => e.id === wedding?.id),
    "and takes the wedding block away",
  );

  console.log("Reschedule: from a session");
  const later = (await sessionsNow()).filter(
    (b) =>
      local(b.start).toPlainDate().equals(today) && local(b.start).hour >= 13,
  );
  const target = later[0] ?? (await sessionsNow())[0];
  if (!target) throw new Error("nothing planned to reschedule from");
  const from = local(target.start).add({ minutes: 5 });
  const fromClock = `${String(from.hour).padStart(2, "0")}:${String(from.minute).padStart(2, "0")}`;
  [rs, moved] = await reschedule({
    scope: "day",
    at: fromClock,
    dismiss: target.id,
    answer: "starving, skipped lunch",
  });
  check(
    rs === 200 && moved.changes.some((c) => /Eat/.test(c)),
    `'starving' earns a break to eat: ${JSON.stringify(moved.changes)}`,
  );
  const { data: again = [] } = await a.db
    .from("blocks")
    .select("*")
    .eq("kind", "session")
    .eq("task_id", target.task_id ?? "");
  check(
    !!again?.every(
      (b) =>
        Date.parse(b.start) >=
          from.add({ hours: 1 }).epochMilliseconds - 5 * 60_000 ||
        Date.parse(b.start) < from.epochMilliseconds - 5 * 60_000,
    ),
    "the rescheduled task waits at least an hour",
  );
  [rs, moved] = await reschedule({
    scope: "day",
    at: fromClock,
    answer: "ugh",
  });
  check(
    rs === 200 && moved.changes.length === 0,
    `a vague answer changes nothing: ${JSON.stringify(moved.changes)}`,
  );

  console.log("Events");
  before = await sessionsNow();
  const victim = before.find(
    (b) =>
      Date.parse(b.start) > Date.now() &&
      !local(b.start).toPlainDate().equals(today),
  );
  if (victim) {
    const start = local(victim.start);
    const end = start.add({ minutes: victim.minutes });
    const { error: eventError } = await a.db.from("blocks").insert({
      kind: "event",
      title: "Work",
      start: start.toInstant().toString(),
      minutes: victim.minutes,
    });
    check(
      !eventError,
      `the student adds a shift over a planned session ${eventError?.message ?? ""}`,
    );
    [rs, moved] = await reschedule({
      scope: {
        kind: "clash",
        start: start.toInstant().toString(),
        end: end.toInstant().toString(),
      },
      at: "13:00",
    });
    after = await sessionsNow();
    check(
      rs === 200 && moved.moved === 1,
      `only the covered session moves (${moved.moved})`,
    );
    check(
      sameSessions(
        before.filter((b) => b.id !== victim.id),
        after.filter((b) => before.some((x) => x.id === b.id)),
      ),
      "everything else stays put",
    );
    await sessionsHold(a, "with the shift");
  }

  console.log("Done and remove");
  // From the school that stays, so the privacy check below has it to look at.
  const stays = feeds?.find((f) => f.name === "mockstate.instructure.com");
  const firstTask = tasks?.find(
    (t) => t.feed_id === stays?.id && Date.parse(t.due) > Date.now(),
  );
  if (!firstTask) throw new Error("no open task");
  const { error: doneError } = await a.db
    .from("tasks")
    .update({ done: true })
    .eq("id", firstTask.id);
  check(!doneError, `tick '${firstTask.title}' done`);
  await reschedule({ scope: "week", at: "13:00" });
  await sessionsHold(a, "after a done tick");
  const college = feeds?.find((f) => f.name === "canvas.mockcollege.edu");
  const { error: removeError } = await a.db
    .from("feeds")
    .delete()
    .eq("id", college?.id ?? "");
  const { data: left = [] } = await a.db.from("tasks").select("id");
  check(
    !removeError && left?.length === wState,
    `removing the college takes its ${wCollege} tasks with it (${left?.length} left)`,
  );
  const ids = new Set(left?.map((t) => t.id));
  const { data: sessions = [] } = await a.db
    .from("blocks")
    .select("id, task_id")
    .eq("kind", "session");
  check(
    !!sessions?.every((b) => ids.has(b.task_id ?? "")),
    "and their sessions",
  );

  console.log("Pages");
  for (const path of [
    "/day",
    "/day?at=15:10",
    "/week",
    `/day?date=${tomorrow}`,
    `/focus/${sessions?.[0]?.id ?? "none"}`,
  ]) {
    check((await a.get(path)) === 200, `${path} renders`);
  }

  console.log("Privacy");
  const b = await arrive();
  const { data: theirs = [] } = await b.db.from("tasks").select("id");
  check(
    theirs?.length === 0,
    "a second student sees none of the first student's tasks",
  );
  await b.db.from("tasks").update({ done: false }).eq("id", firstTask.id);
  const { data: still } = await a.db
    .from("tasks")
    .select("done")
    .eq("id", firstTask.id)
    .single();
  check(still?.done === true, "and can't change them");
  const theirsBefore = (await a.db.from("blocks").select("id")).data?.length;
  await b.post("/api/reschedule", {
    scope: "day",
    dismiss: sessions?.[0]?.id,
    answer: "x",
  });
  const theirsAfter = (await a.db.from("blocks").select("id")).data?.length;
  check(
    theirsBefore === theirsAfter,
    "and rescheduling from someone else's session does nothing to it",
  );

  console.log(
    failures.length
      ? `\n${failures.length} FAILED:\n  ${failures.join("\n  ")}`
      : "\nALL PASSED",
  );
  process.exit(failures.length ? 1 : 0);
}

await main();
