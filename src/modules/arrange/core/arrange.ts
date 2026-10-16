import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, MODEL } from "@/lib/claude";
import type { createClient } from "@/lib/supabase/server";
import {
  addMinutes,
  clock,
  iso,
  minutesBetween,
  shortDate,
  type Zoned,
  zoned,
} from "@/lib/time";
import type { Work } from "@/modules/import/core/reading";
import type { Changes } from "@/modules/suggest/core/changes";
import { restWords } from "@/modules/suggest/core/rest";
import { understand } from "@/modules/suggest/core/understand";
import { hoursOf } from "./hours";
import {
  check,
  HORIZON_DAYS,
  type Limit,
  message,
  NOT_NOW,
  type OpenTask,
  type Placed,
  type Plan,
  type Span,
  weekFrom,
} from "./plan";

// Reschedule: "What's wrong?" → Claude turns the answer into changes (a
// lighter day, busy time, a break now) → code checks and saves them → the
// scope decides which sessions may move (the next hour, today, the week, or
// just those under a new busy time) → Claude proposes where they go → `check`
// drops what breaks a hard rule → saved, with exactly what Undo needs.
// Sessions outside the scope, breaks and the student's events never move.

type Client = Awaited<ReturnType<typeof createClient>>;

export type Scope =
  | { kind: "hour" }
  | { kind: "day" }
  | { kind: "week" }
  | { kind: "clash"; start: string; end: string };

const SYSTEM = `You place a college student's coursework into work sessions within this school week (through Saturday).

You get each day's open time and busy times, any lighter days, the student's active hours (for each hour, the share of recent days they were on their laptop then), their tasks with due time, minutes to place, a one-line description and whether the work is deep or light, and what is moving.

Arrange it the way research on time and attention says:
- Deadlines first. Work due within a day or two gets its time first and ends before it's due.
- Match work to the clock. People think best at the hours they're usually most active. Put deep work in the hours with the highest active share and light work in lower ones. Never use an hour under 10%.
- Spread long work out. Spaced sessions beat one long push: a task with more than 90 minutes left is split across several days before it's due.
- One course at a time. Switching subjects costs focus, so put sessions of the same course next to each other and change course only after a break.
- Breaks. Sessions run 25 to 90 minutes, with at least 10 minutes between them.
- Leave room. People underestimate how long work takes, so keep at least a third of each day's open time free, and no more than 4 hours of deep work in a day.
- Busy times (classes, work, breaks, sessions that stay) are fixed: never put a session over one.
- A lighter day keeps within its minutes, and gets no deep work unless it says so.
- Place only what the instruction says is moving, and keep the plan before steady where you can.

Return sessions with the task id, the day number, a start time as HH:MM (24-hour) and minutes.`;

const Arrangement = z.object({
  sessions: z.array(
    z.object({
      task: z.string(),
      day: z.number().int(),
      start: z.string(),
      minutes: z.number().int(),
    }),
  ),
});

/** Everything a reschedule changed, so Undo can put it back exactly. */
export interface Undo {
  remove: { blocks: string[]; limits: string[] };
  restore: {
    sessions: {
      task_id: string;
      start: string;
      minutes: number;
      done: boolean;
    }[];
    limits: { day: string; minutes: number; deep: boolean }[];
  };
}

export interface Rescheduled {
  moved: number; // sessions that were allowed to move
  placed: number; // sessions placed
  unplaced: number; // minutes that didn't fit this week
  changes: string[]; // what the answer changed, in plain words written by code
  undo: Undo;
}

export async function reschedule(
  supabase: Client,
  nowDate: Date,
  options: { scope: Scope; answer?: string; dismiss?: string },
): Promise<Rescheduled> {
  const { data: settings } = await supabase
    .from("settings")
    .select("time_zone, active_hours")
    .maybeSingle();
  // Learned by the optional extension, or plain default hours until then.
  const { hours, learned } = hoursOf(settings?.active_hours);
  const tz = settings?.time_zone ?? "UTC";
  const now = zoned(nowDate, tz);
  const days = weekFrom(now);
  const dateOf = (d: number) => days[d].end.subtract({ days: 1 }).toPlainDate();

  const [tasksResult, blocksResult, limitsResult, dismissalsResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, course, deliverable, due, minutes, work, read, done",
        ),
      supabase
        .from("blocks")
        .select("id, kind, start, minutes, task_id, rest, title, done"),
      supabase.from("day_limits").select("id, day, minutes, deep"),
      supabase.from("dismissals").select("task_id, at"),
    ]);
  for (const r of [tasksResult, blocksResult, limitsResult, dismissalsResult])
    if (r.error) throw r.error;
  const taskRows = tasksResult.data ?? [];
  const blocks = (blocksResult.data ?? []).map((b) => ({
    ...b,
    at: zoned(b.start, tz),
  }));
  const ends = (b: { at: Zoned; minutes: number }) =>
    addMinutes(b.at, b.minutes);
  const titles = new Map(taskRows.map((t) => [t.id, t.title]));
  const works = new Map(taskRows.map((t) => [t.id, t.work]));
  const undo: Undo = {
    remove: { blocks: [], limits: [] },
    restore: { sessions: [], limits: [] },
  };
  const changes: string[] = [];

  // The session the student rescheduled from, if any: it moves, and its task waits an hour.
  const from = options.dismiss
    ? blocks.find((b) => b.id === options.dismiss && b.kind === "session")
    : undefined;
  if (from?.task_id) {
    const { error } = await supabase
      .from("dismissals")
      .insert({ task_id: from.task_id, at: iso(now) });
    if (error) throw error;
  }

  // 1. What's wrong → changes, saved where the student can see and correct them.
  const sessionsNow = blocks.filter((b) => b.kind === "session" && b !== from);
  const ongoing = sessionsNow.filter(
    (b) =>
      b.at.epochMilliseconds <= now.epochMilliseconds &&
      ends(b).epochMilliseconds > now.epochMilliseconds,
  );
  const restStart =
    options.scope.kind === "week" && ongoing.length ? ends(ongoing[0]) : now;
  const today = blocks.filter((b) =>
    b.at.toPlainDate().equals(now.toPlainDate()),
  );
  const found: Changes | null = await understand({
    answer: options.answer ?? "",
    now,
    days,
    restStart,
    activeShare: hours[now.hour],
    workedToday: today
      .filter((b) => b.kind === "session" && b !== from)
      .reduce(
        (sum, b) =>
          sum + Math.max(0, Math.min(b.minutes, minutesBetween(b.at, now))),
        0,
      ),
    lastBreakEnd:
      today
        .filter(
          (b) =>
            b.kind === "break" &&
            ends(b).epochMilliseconds <= now.epochMilliseconds,
        )
        .map(ends)
        .sort((a, b) => b.epochMilliseconds - a.epochMilliseconds)[0] ?? null,
    session: from?.task_id
      ? {
          title: titles.get(from.task_id) ?? "a session",
          work: works.get(from.task_id) ?? "light",
        }
      : null,
  });

  const limitRows = limitsResult.data ?? [];
  for (const l of found?.lighter ?? []) {
    const day = dateOf(l.day).toString();
    const before = limitRows.find((r) => r.day === day);
    const { data, error } = await supabase
      .from("day_limits")
      .upsert(
        { day, minutes: l.minutes, deep: l.deep },
        { onConflict: "owner_id,day" },
      )
      .select("id")
      .single();
    if (error) throw error;
    if (before)
      undo.restore.limits.push({
        day,
        minutes: before.minutes,
        deep: before.deep,
      });
    else undo.remove.limits.push(data.id);
    const rest = limitRows.filter((r) => r.day !== day);
    limitRows.splice(0, limitRows.length, ...rest, {
      id: data.id,
      day,
      minutes: l.minutes,
      deep: l.deep,
    });
    changes.push(
      `${l.day === 0 ? "Today" : shortDate(days[l.day].end.subtract({ days: 1 }))}: ${l.minutes ? `at most ${Math.round((l.minutes / 60) * 10) / 10}h of work` : "no work"}${l.deep || !l.minutes ? "" : ", nothing heavy"}.`,
    );
  }
  for (const b of found?.busy ?? []) {
    const minutes = minutesBetween(b.start, b.end);
    const { data, error } = await supabase
      .from("blocks")
      .insert({ kind: "event", title: b.title, start: iso(b.start), minutes })
      .select("id")
      .single();
    if (error) throw error;
    undo.remove.blocks.push(data.id);
    blocks.push({
      id: data.id,
      kind: "event",
      start: iso(b.start),
      at: b.start,
      minutes,
      task_id: null,
      rest: null,
      title: b.title,
      done: false,
    });
    changes.push(
      `${b.title}: ${shortDate(b.start)}, ${clock(b.start)}–${clock(b.end)}.`,
    );
  }
  if (found?.rest) {
    const { data, error } = await supabase
      .from("blocks")
      .insert({
        kind: "break",
        rest: found.rest.rest,
        start: iso(restStart),
        minutes: found.rest.minutes,
      })
      .select("id")
      .single();
    if (error) throw error;
    undo.remove.blocks.push(data.id);
    blocks.push({
      id: data.id,
      kind: "break",
      start: iso(restStart),
      at: restStart,
      minutes: found.rest.minutes,
      task_id: null,
      rest: found.rest.rest,
      title: null,
      done: false,
    });
    changes.push(restWords(found.rest.rest, found.rest.minutes));
  }

  // 2. The scope decides which sessions may move.
  const weekEnd = days[days.length - 1].end;
  const endOfToday = days[0].end;
  const inWindow = (
    b: { at: Zoned; minutes: number },
    start: Zoned,
    end: Zoned,
  ) =>
    b.at.epochMilliseconds < end.epochMilliseconds &&
    ends(b).epochMilliseconds > start.epochMilliseconds;
  const scope = options.scope;
  const clash =
    scope.kind === "clash"
      ? { start: zoned(scope.start, tz), end: zoned(scope.end, tz) }
      : null;
  const movable = blocks.filter((b) => {
    if (b.kind !== "session" || b.done) return false;
    if (b === from) return true;
    const future = b.at.epochMilliseconds >= now.epochMilliseconds;
    switch (scope.kind) {
      case "hour":
        return inWindow(b, now, addMinutes(now, 60));
      case "day":
        return inWindow(b, now, endOfToday);
      case "week":
        return future && b.at.epochMilliseconds < weekEnd.epochMilliseconds;
      case "clash":
        return future && !!clash && inWindow(b, clash.start, clash.end);
      default:
        return false;
    }
  });
  // A new busy time or a lighter day also moves the work it touches, whatever the scope.
  for (const b of blocks) {
    if (
      b.kind !== "session" ||
      b.done ||
      movable.includes(b) ||
      b.at.epochMilliseconds < now.epochMilliseconds
    )
      continue;
    const underBusy = (found?.busy ?? []).some((busy) =>
      inWindow(b, busy.start, busy.end),
    );
    const onLighterDay = (found?.lighter ?? []).some((l) =>
      b.at.toPlainDate().equals(dateOf(l.day)),
    );
    if (underBusy || onLighterDay) movable.push(b);
  }
  const movableIds = new Set(movable.map((b) => b.id));
  const kept = blocks.filter(
    (b) => b.kind === "session" && !movableIds.has(b.id),
  );

  const horizon = now.add({ days: HORIZON_DAYS }).epochMilliseconds;
  const allowance =
    scope.kind === "week"
      ? null
      : movable.reduce((map, b) => {
          if (b.task_id)
            map.set(b.task_id, (map.get(b.task_id) ?? 0) + b.minutes);
          return map;
        }, new Map<string, number>());
  const open: OpenTask[] = taskRows
    .filter(
      (t) => t.read && !t.done && t.work && (!allowance || allowance.has(t.id)),
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      course: t.course,
      detail: t.deliverable,
      due: zoned(t.due, tz),
      minutes: t.minutes,
      work: t.work as Work,
    }))
    .filter(
      (t) =>
        t.due.epochMilliseconds > now.epochMilliseconds &&
        t.due.epochMilliseconds <= horizon,
    )
    .sort((a, b) => a.due.epochMilliseconds - b.due.epochMilliseconds);

  const busy: Span[] = [
    ...blocks
      .filter((b) => b.kind !== "session")
      .map((b) => ({
        start: b.at,
        end: ends(b),
        label: b.kind === "break" ? "break" : (b.title ?? "busy"),
      })),
    ...kept.map((b) => ({
      start: b.at,
      end: ends(b),
      label: `session on ${titles.get(b.task_id ?? "") ?? "a task"}`,
    })),
  ];
  const done = new Map<string, number>();
  for (const b of kept)
    if (b.task_id) done.set(b.task_id, (done.get(b.task_id) ?? 0) + b.minutes);
  const perDay = (deepOnly: boolean) =>
    days.map((_, d) =>
      kept
        .filter((b) => b.at.toPlainDate().equals(dateOf(d)))
        .filter((b) => !deepOnly || works.get(b.task_id ?? "") === "deep")
        .reduce((sum, b) => sum + b.minutes, 0),
    );
  const limits: (Limit | null)[] = days.map((_, d) => {
    const row = limitRows.find((r) => r.day === dateOf(d).toString());
    return row ? { minutes: row.minutes, deep: row.deep } : null;
  });
  const notBefore = new Map<string, Zoned>();
  const wait = (task: string, until: Zoned) => {
    const prior = notBefore.get(task);
    if (
      until.epochMilliseconds > now.epochMilliseconds &&
      (!prior || until.epochMilliseconds > prior.epochMilliseconds)
    ) {
      notBefore.set(task, until);
    }
  };
  for (const d of [
    ...(dismissalsResult.data ?? []),
    ...(from?.task_id ? [{ task_id: from.task_id, at: iso(now) }] : []),
  ]) {
    wait(d.task_id, addMinutes(zoned(d.at, tz), NOT_NOW));
  }
  if (scope.kind === "hour")
    for (const b of movable)
      if (b.task_id) wait(b.task_id, addMinutes(now, 60));

  const movingList = movable
    .filter((b) => b.task_id)
    .map(
      (b) =>
        `${titles.get(b.task_id ?? "")} (${b.minutes} min, was ${shortDate(b.at)} ${clock(b.at)})`,
    );
  const instruction = {
    hour: `Push off the next hour: only these sessions move, to after ${clock(addMinutes(now, 60))}, preferably later today and in the same order; nothing else changes. Moving: ${movingList.join("; ") || "nothing"}.`,
    day: `Reschedule today: only today's remaining sessions move, later today if the day allows, otherwise to the next days this week; other days' sessions stay. Moving: ${movingList.join("; ") || "nothing"}.`,
    week: "Plan the rest of this school week: everything still to do is open to placement.",
    clash: `A new busy time covers these sessions: move just them, as close to their old time as fits. Moving: ${movingList.join("; ") || "nothing"}.`,
  }[scope.kind];

  const plan: Plan = {
    now,
    hours,
    learned,
    days,
    ids: new Map(open.map((t, n) => [`t${n + 1}`, t])),
    busy,
    done,
    keptDeep: perDay(true),
    keptWork: perDay(false),
    limits,
    notBefore,
    allowance,
    instruction,
    current: movable
      .filter((b) => b !== from && b.task_id)
      .map((b) => ({
        task: b.task_id ?? "",
        start: b.at,
        minutes: b.minutes,
        work: (works.get(b.task_id ?? "") ?? "light") as Work,
      })),
  };

  // 3. Place, check, save.
  let placed: Placed[] = [];
  const toPlace = allowance
    ? [...allowance.values()].reduce((a, b) => a + b, 0)
    : 1;
  if (plan.ids.size && toPlace > 0) {
    const response = await claude().messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Arrangement) },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: message(plan) }],
    });
    placed = check(response.parsed_output?.sessions ?? [], plan);
  }

  if (movable.length) {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .in(
        "id",
        movable.map((b) => b.id),
      );
    if (error) throw error;
    undo.restore.sessions.push(
      ...movable
        .filter((b) => b.task_id)
        .map((b) => ({
          task_id: b.task_id ?? "",
          start: b.start,
          minutes: b.minutes,
          done: b.done,
        })),
    );
  }
  if (placed.length) {
    const { data, error } = await supabase
      .from("blocks")
      .insert(
        placed.map((s) => ({
          kind: "session",
          task_id: s.task,
          start: iso(s.start),
          minutes: s.minutes,
        })),
      )
      .select("id");
    if (error) throw error;
    undo.remove.blocks.push(...(data ?? []).map((b) => b.id));
  }
  const placedMinutes = placed.reduce((sum, s) => sum + s.minutes, 0);
  return {
    moved: movable.length,
    placed: placed.length,
    unplaced: allowance ? Math.max(0, toPlace - placedMinutes) : 0,
    changes,
    undo,
  };
}

/** Put back exactly what a reschedule changed. Runs as the student, under RLS. */
export async function undoReschedule(
  supabase: Client,
  undo: Undo,
): Promise<void> {
  if (undo.remove.blocks.length) {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .in("id", undo.remove.blocks);
    if (error) throw error;
  }
  if (undo.remove.limits.length) {
    const { error } = await supabase
      .from("day_limits")
      .delete()
      .in("id", undo.remove.limits);
    if (error) throw error;
  }
  if (undo.restore.limits.length) {
    const { error } = await supabase
      .from("day_limits")
      .upsert(undo.restore.limits, { onConflict: "owner_id,day" });
    if (error) throw error;
  }
  if (undo.restore.sessions.length) {
    const { error } = await supabase
      .from("blocks")
      .insert(undo.restore.sessions.map((s) => ({ kind: "session", ...s })));
    if (error) throw error;
  }
}
