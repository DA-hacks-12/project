import type { createClient } from "@/lib/supabase/server";
import { addMinutes, iso, type Zoned, zoned } from "@/lib/time";
import { classTimes } from "@/modules/classes/core/classes";
import { isMockSchool } from "@/modules/import/core/mock";
import type { Work } from "@/modules/import/core/reading";
import { bodyClockOf } from "./body-clock";
import {
  checkAndFill,
  type OpenTask,
  type Placed,
  type Span,
  type Window,
} from "./plan";

// The mock schools are demo data, so their import fills in this week so far:
// the work due earlier this week (brought in done) and today's, laid into
// Sunday through now as done sessions by the planner's own rules, each task
// in the two days before it was due (today's today), the way a plan made on
// Sunday would have put it. Runs after the reading and before the plan for what's ahead, which
// then places only what's left. A real school's week starts at the import.

type Client = Awaited<ReturnType<typeof createClient>>;

/** Sessions for `tasks` from Sunday until `now`, by the planner's rules. Plain code. */
export function weekSoFar(
  tasks: OpenTask[],
  now: Zoned,
  hours: number[],
  busy: Span[],
): Placed[] {
  const today = now.startOfDay();
  const sunday = today.subtract({ days: today.dayOfWeek % 7 });
  // Whole days (the planner's days run midnight to midnight), with the rest
  // of today, from now, taken.
  const days: Window[] = Array.from(
    { length: (today.dayOfWeek % 7) + 1 },
    (_, d) => ({
      start: sunday.add({ days: d }),
      end: sunday.add({ days: d + 1 }),
    }),
  );
  const later = { start: now, end: today.add({ days: 1 }), label: "later" };
  return checkAndFill([], {
    now: days[0].start,
    hours,
    clock: "",
    preferences: [],
    days,
    ids: new Map(tasks.map((t, n) => [`${n + 1}`, t])),
    busy: [...busy, later],
    done: new Map(),
    keptDeep: days.map(() => 0),
    keptWork: days.map(() => 0),
    limits: days.map(() => null),
    notBefore: new Map(
      tasks.map((t) => [
        t.id,
        t.due.startOfDay().equals(today)
          ? today
          : t.due.startOfDay().subtract({ days: 2 }),
      ]),
    ),
    allowance: null,
    instruction: "",
    current: [],
  }).placed;
}

/** For the student's mock schools: this week so far, done. Returns the sessions laid in. */
export async function fillWeekSoFar(
  supabase: Client,
  nowDate: Date,
): Promise<number> {
  const [settings, feeds, tasks, blocks, classRows] = await Promise.all([
    supabase.from("settings").select("time_zone, nights, clock").maybeSingle(),
    supabase.from("feeds").select("id, name"),
    supabase
      .from("tasks")
      .select(
        "id, feed_id, title, course, deliverable, due, minutes, work, read",
      ),
    supabase.from("blocks").select("kind, start, minutes, task_id"),
    supabase
      .from("classes")
      .select("id, title, days, start, minutes, place, starts_on, ends_on"),
  ]);
  for (const r of [feeds, tasks, blocks, classRows]) if (r.error) throw r.error;
  const mock = new Set(
    (feeds.data ?? []).filter((f) => isMockSchool(f.name)).map((f) => f.id),
  );
  if (!mock.size) return 0;

  const tz = settings.data?.time_zone ?? "UTC";
  const now = zoned(nowDate, tz);
  const today = now.startOfDay();
  const sunday = today.subtract({ days: today.dayOfWeek % 7 });

  const planned = new Set((blocks.data ?? []).map((b) => b.task_id));
  const endOfToday = today.add({ days: 1 }).epochMilliseconds;
  const open: OpenTask[] = (tasks.data ?? [])
    .filter(
      (t) =>
        mock.has(t.feed_id) &&
        t.read &&
        t.work &&
        t.minutes &&
        !planned.has(t.id) &&
        Date.parse(t.due) >= sunday.epochMilliseconds &&
        Date.parse(t.due) <= endOfToday,
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      course: t.course,
      detail: t.deliverable,
      due: zoned(t.due, tz),
      minutes: t.minutes,
      work: t.work as Work,
    }));
  if (!open.length) return 0;

  const busy: Span[] = [
    ...(blocks.data ?? [])
      .filter((b) => b.kind !== "nature")
      .map((b) => {
        const start = zoned(b.start, tz);
        return {
          start,
          end: addMinutes(start, b.minutes),
          label: b.kind,
          session: b.kind === "session",
        };
      }),
    // Done work was never in class.
    ...classTimes(classRows.data ?? [], sunday, now).map((c) => ({
      start: c.start,
      end: c.end,
      label: c.rule.title,
    })),
  ];
  const placed = weekSoFar(
    open,
    now,
    bodyClockOf(settings.data ?? {}).hours,
    busy,
  );
  if (!placed.length) return 0;
  const { error } = await supabase.from("blocks").insert(
    placed.map((s) => ({
      kind: "session",
      task_id: s.task,
      start: iso(s.start),
      minutes: s.minutes,
      done: true,
    })),
  );
  if (error) throw error;
  // Today's work that's all done by now is ticked, like the days before.
  const got = new Map<string, number>();
  for (const s of placed) got.set(s.task, (got.get(s.task) ?? 0) + s.minutes);
  const finished = open
    .filter((t) => (got.get(t.id) ?? 0) >= (t.minutes ?? 0))
    .map((t) => t.id);
  if (finished.length) {
    const { error: doneError } = await supabase
      .from("tasks")
      .update({ done: true })
      .in("id", finished);
    if (doneError) throw doneError;
  }
  return placed.length;
}
