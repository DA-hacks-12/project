import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, SONNET, tally } from "@/lib/claude";
import { fastAnswer } from "@/lib/openrouter";
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
import {
  clearNature,
  type NatureRestore,
} from "@/modules/suggest/core/nature-run";
import { restWords } from "@/modules/suggest/core/rest";
import { understand } from "@/modules/suggest/core/understand";
import { bodyClockOf, describe } from "./body-clock";
import {
  checkAndFill,
  type Limit,
  message,
  NOT_NOW,
  type OpenTask,
  type Placed,
  type Plan,
  SESSION,
  type Span,
  weekFrom,
} from "./plan";
import { preferenceRules, preferencesOf } from "./preferences";

// Reschedule: "What's wrong?" → Claude turns the answer into changes (a
// lighter day, busy time, a break now) → code checks and saves them → the
// scope decides which sessions may move (a day, the week, or just those
// under a new busy time) → Claude proposes where they go → `check`
// drops what breaks a hard rule → saved, with exactly what Undo needs.
// Sessions outside the scope, breaks and the student's events never move.

type Client = Awaited<ReturnType<typeof createClient>>;

export type Scope =
  // Today's remaining work, or another day of the plan's (YYYY-MM-DD).
  | { kind: "day"; date?: string }
  | { kind: "week" }
  | { kind: "clash"; start: string; end: string }
  // After an import: place only the work not planned yet; nothing moves.
  | { kind: "fill" };

const SYSTEM = `You place a college student's coursework into work sessions within this school week and the next (through Saturday of next week).

You get each day's open time and busy times, any lighter days, the student's body clock (when they sleep, their chronotype, and their alertness hour by hour), their tasks with due time, minutes to place, a one-line description and whether the work is deep or light, and what is moving.

Arrange it the way research on time and attention says:
- Deadlines first. Work due within a day or two gets its time first and ends before it's due.
- Match work to the body clock. Alertness builds after waking, peaks, and falls toward sleep (the synchrony effect: people do hard thinking best at their own peak). Put deep work in the most alert hours and light work in lower ones. Never use an hour marked 0: the student is asleep.
- Spread long work out. A task with more than 90 minutes left gets sessions on several days before it's due: material studied across days sticks better than the same hours in one push (the spacing effect), and coming back to an essay or a problem set after a night's sleep helps.
- Vary the work. Focus wears down over hours on one task, and mixing subjects between sessions helps learning (interleaving). After a session, the next one is usually a different task, ideally another course; never more than two sessions in a row on the same task.
- Breaks. Sessions run 25 to 90 minutes, with at least 10 minutes between them.
- Pace the day. Attention wears down with time on task, and a real break restores it: after 90 minutes of work in a row (sessions less than 30 minutes apart count as one stretch), leave at least 30 minutes free before the next session.
- Leave room. People underestimate how long work takes, so keep at least a third of each day's open time free, and no more than 4 hours of deep work in a day.
- Busy times (classes, work, breaks, sessions that stay) are fixed: never put a session over one.
- A lighter day keeps within its minutes, and gets no deep work unless it says so.
- Place only what the instruction says is moving, and keep the plan before steady where you can, but the student's preferences come first: when the plan before doesn't follow them, change it.

The student may also give preferences (how big the chunks are, what each day starts with, breaks, how many courses a day, how early to finish, weekends). Follow them over the research guidelines above, but never break a deadline, a busy time, a lighter day, the 4-hour deep cap or the free third.

Return the sessions as s, each with t (the task number), d (the day number), at (the start, HH:MM, 24-hour) and m (minutes).`;

// Short keys and numbers, not names: every token here is one the model has
// to write. t = task number, d = day number, at = start (HH:MM), m = minutes.
const Arrangement = z.strictObject({
  s: z.array(
    z.strictObject({
      t: z.number().int(),
      d: z.number().int(),
      at: z.string(),
      m: z.number().int(),
    }),
  ),
});

/** Everything a reschedule changed, so Undo can put it back exactly. */
export interface Undo {
  remove: { blocks: string[]; limits: string[]; dismissals?: string[] };
  restore: {
    nature: NatureRestore[];
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
  unplaced: number; // minutes that didn't fit
  changes: string[]; // what the answer changed, in plain words written by code
  /** Days whose walks were cleared, for the page to plan again (YYYY-MM-DD). */
  walkDays: string[];
  undo: Undo;
}

/**
 * If anything fails midway, what was already saved (a lighter day, a busy
 * time, a break, the wait) is taken back, so a failed reschedule changes nothing.
 */
export async function reschedule(
  supabase: Client,
  nowDate: Date,
  options: { scope: Scope; answer?: string; dismiss?: string },
): Promise<Rescheduled> {
  const undo: Undo = {
    remove: { blocks: [], limits: [], dismissals: [] },
    restore: { sessions: [], limits: [], nature: [] },
  };
  try {
    return await rescheduleInto(supabase, nowDate, options, undo);
  } catch (error) {
    await undoReschedule(supabase, undo).catch((e) =>
      console.error("rollback", e),
    );
    throw error;
  }
}

async function rescheduleInto(
  supabase: Client,
  nowDate: Date,
  options: { scope: Scope; answer?: string; dismiss?: string },
  undo: Undo,
): Promise<Rescheduled> {
  const { data: settings } = await supabase
    .from("settings")
    .select("time_zone, nights, clock, preferences")
    .maybeSingle();
  // Learned by the optional extension, set by the student, or a default.
  const bodyClock = bodyClockOf(settings ?? {});
  const { hours } = bodyClock;
  const preferences = preferenceRules(preferencesOf(settings?.preferences));
  const tz = settings?.time_zone ?? "UTC";
  const now = zoned(nowDate, tz);
  const days = weekFrom(now);
  const dateOf = (d: number) => days[d].end.subtract({ days: 1 }).toPlainDate();
  const scope = options.scope;
  // The day a Day reschedule works on: today unless it names another of the plan's days.
  const chosen = Math.max(
    0,
    scope.kind === "day" && scope.date
      ? days.findIndex((_, d) => dateOf(d).toString() === scope.date)
      : 0,
  );

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
  const changes: string[] = [];

  // The session the student rescheduled from, if any: it moves, and its task waits an hour.
  const from = options.dismiss
    ? blocks.find((b) => b.id === options.dismiss && b.kind === "session")
    : undefined;
  if (from?.task_id) {
    const { data, error } = await supabase
      .from("dismissals")
      .insert({ task_id: from.task_id, at: iso(now) })
      .select("id")
      .single();
    if (error) throw error;
    undo.remove.dismissals?.push(data.id);
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
    asleep: bodyClock.asleep,
    day: chosen,
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
  const inWindow = (
    b: { at: Zoned; minutes: number },
    start: Zoned,
    end: Zoned,
  ) =>
    b.at.epochMilliseconds < end.epochMilliseconds &&
    ends(b).epochMilliseconds > start.epochMilliseconds;
  const clash =
    scope.kind === "clash"
      ? { start: zoned(scope.start, tz), end: zoned(scope.end, tz) }
      : null;
  const movable = blocks.filter((b) => {
    if (b.kind !== "session" || b.done) return false;
    if (b === from) return true;
    const future = b.at.epochMilliseconds >= now.epochMilliseconds;
    switch (scope.kind) {
      case "day":
        // Today from now (with a session under way), or all of another day.
        return inWindow(b, chosen ? days[chosen].start : now, days[chosen].end);
      case "week":
        // Every future session, even past the plan's last day (left from an
        // older plan), so nothing stale stays behind.
        return future;
      case "clash":
        return future && !!clash && inWindow(b, clash.start, clash.end);
      case "fill":
        return false;
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

  // Only work due by the plan's last Saturday: next week's work comes in when
  // its week does.
  const horizon = weekEnd.epochMilliseconds;
  // Fill: each task may place what its sessions don't cover yet.
  const owed = new Map<string, number>();
  if (scope.kind === "fill")
    for (const t of taskRows) {
      if (!t.read || t.done || !t.work || !t.minutes) continue;
      const due = Date.parse(t.due);
      if (due <= now.epochMilliseconds || due > horizon) continue;
      const planned = kept
        .filter((b) => b.task_id === t.id)
        .reduce((sum, b) => sum + b.minutes, 0);
      if (t.minutes - planned >= SESSION.min)
        owed.set(t.id, t.minutes - planned);
    }
  const allowance =
    scope.kind === "week"
      ? null
      : scope.kind === "fill"
        ? owed
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
    // Nature suggestions never block anything: they're planned again after.
    ...blocks
      .filter((b) => b.kind !== "session" && b.kind !== "nature")
      .map((b) => ({
        start: b.at,
        end: ends(b),
        label: b.kind === "break" ? "break" : (b.title ?? "busy"),
      })),
    ...kept.map((b) => ({
      start: b.at,
      end: ends(b),
      label: `session on ${titles.get(b.task_id ?? "") ?? "a task"}`,
      session: true,
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

  const movingList = movable
    .filter((b) => b.task_id)
    .map(
      (b) =>
        `${titles.get(b.task_id ?? "")} (${b.minutes} min, was ${shortDate(b.at)} ${clock(b.at)})`,
    );
  const instruction = {
    day: chosen
      ? `Reschedule day ${chosen} (${shortDate(days[chosen].start)}): only that day's sessions move, elsewhere that day if it allows, otherwise to other days before they're due; other days' sessions stay. Moving: ${movingList.join("; ") || "nothing"}.`
      : `Reschedule today: only today's remaining sessions move, later today if the day allows, otherwise to the next days; other days' sessions stay. Moving: ${movingList.join("; ") || "nothing"}.`,
    week: "Plan the rest of this week and next: everything still to do is open to placement.",
    clash: `A new busy time covers these sessions: move just them, as close to their old time as fits. Moving: ${movingList.join("; ") || "nothing"}.`,
    fill: "New or changed work came in: place only the minutes each task still has to place, around everything already planned, which stays where it is.",
  }[scope.kind];

  const plan: Plan = {
    now,
    hours,
    clock: describe(bodyClock),
    preferences,
    days,
    ids: new Map(open.map((t, n) => [`${n + 1}`, t])),
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
    const asked = message(plan);
    // Reschedule → Week runs on the fast open model (the owner's call for the
    // stage); everything else, and any failure there, on Sonnet.
    const askFast = () =>
      fastAnswer("plan", Arrangement, SYSTEM, asked).catch((error) => {
        console.error("openrouter plan", error);
        return null;
      });
    let fast = scope.kind === "week" ? await askFast() : null;
    // No sessions at all with work to place is a slip: ask once more (if it
    // slips again, code places the work).
    if (fast && !fast.s.length) fast = await askFast();
    let answer = fast;
    if (!answer) {
      const response = await claude().messages.parse({
        model: SONNET,
        max_tokens: 16000,
        output_config: {
          effort: "medium",
          format: zodOutputFormat(Arrangement),
        },
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: asked }],
      });
      tally("plan", SONNET, response.usage);
      answer = response.parsed_output;
    }
    const proposals = (answer?.s ?? []).map((x) => ({
      task: String(x.t),
      day: x.d,
      start: x.at,
      minutes: x.m,
    }));
    const dropped: string[] = [];
    const result = checkAndFill(proposals, plan, dropped);
    placed = result.placed;
    const reasons = new Map<string, number>();
    for (const why of dropped) reasons.set(why, (reasons.get(why) ?? 0) + 1);
    const counts = [...reasons];
    console.info(
      `plan ${scope.kind}${fast ? " (fast)" : ""}: ${proposals.length} proposed, ${placed.length - result.filled} kept, ${result.filled} filled in by code${counts.length ? `; dropped ${counts.map(([why, n]) => `${n} ${why}`).join(", ")}` : ""}`,
    );
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
  // 4. Nature suggestions on the days that changed go (all of them when the
  // whole week was planned); the page plans them again around the new plan
  // once this has answered, so the plan never waits on a walk.
  const dayIndex = (at: Zoned) =>
    days.findIndex((_, d) => dateOf(d).equals(at.toPlainDate()));
  const which =
    scope.kind === "week"
      ? days.map((_, d) => d)
      : [
          ...movable.map((b) => dayIndex(b.at)),
          ...placed.map((s) => dayIndex(s.start)),
          ...(found?.busy ?? []).map((b) => dayIndex(b.start)),
          ...(found?.lighter ?? []).map((l) => l.day),
          ...(found?.rest ? [0] : []),
          ...(clash ? [dayIndex(clash.start)] : []),
        ].filter((d) => d >= 0);
  // Extra: if it fails, the plan still stands.
  const cleared = await clearNature(supabase, { now, days, which }).catch(
    (error) => {
      console.error("nature", error);
      return [];
    },
  );
  undo.restore.nature.push(...cleared);

  const placedMinutes = placed.reduce((sum, s) => sum + s.minutes, 0);
  const newMinutes = placed.reduce(
    (map, s) => map.set(s.task, (map.get(s.task) ?? 0) + s.minutes),
    new Map<string, number>(),
  );
  return {
    moved: movable.length,
    placed: placed.length,
    unplaced: allowance
      ? Math.max(0, toPlace - placedMinutes)
      : // The whole plan: minutes still owed to work due by its last Saturday.
        open.reduce((sum, t) => {
          const got = (done.get(t.id) ?? 0) + (newMinutes.get(t.id) ?? 0);
          return sum + Math.max(0, (t.minutes ?? 0) - got);
        }, 0),
    changes,
    walkDays: [...new Set(which)].map((d) => dateOf(d).toString()),
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
  if (undo.remove.dismissals?.length) {
    const { error } = await supabase
      .from("dismissals")
      .delete()
      .in("id", undo.remove.dismissals);
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
  if (undo.restore.nature.length) {
    const { error } = await supabase
      .from("blocks")
      .insert(undo.restore.nature.map((n) => ({ kind: "nature", ...n })));
    if (error) throw error;
  }
}
