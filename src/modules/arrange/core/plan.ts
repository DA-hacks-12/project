import {
  addMinutes,
  atClock,
  hhmm,
  minutesBetween,
  nextStep,
  shortDate,
  type Zoned,
} from "@/lib/time";
import type { Work } from "@/modules/import/core/reading";

// The week plan's hard rules, as plain code. The model proposes sessions;
// `check` keeps only those that hold. A plan covers this school week and the
// next: today through Saturday of next week (weeks start on Sunday).

export const AWAKE = 10; // alertness under this (asleep) is never used
export const SESSION = { min: 10, max: 90 }; // minutes
// Pacing: attention wears down with time on task, and a real break restores
// it. Sessions less than REST minutes apart are one stretch of work, and a
// stretch holds at most STRETCH minutes of it.
export const STRETCH = 90;
export const REST = 30;
export const DEEP_PER_DAY = 240; // about four hours of hard thinking a day is the most people sustain
export const FREE_SHARE = 1 / 3; // planning fallacy: a third of each day's open time stays free
export const NOT_NOW = 60; // minutes before a dismissed task can come back

export interface OpenTask {
  id: string;
  title: string;
  course: string | null;
  detail: string | null; // the interpretation's one line: what to hand in
  due: Zoned;
  minutes: number | null;
  work: Work;
}

export interface Span {
  start: Zoned;
  end: Zoned;
  label: string;
  session?: boolean; // a session that stays: work, for pacing
}

export interface Window {
  start: Zoned;
  end: Zoned;
}

/** A lighter day: at most `minutes` of work, and deep work only if `deep`. */
export interface Limit {
  minutes: number;
  deep: boolean;
}

export interface Placed {
  task: string;
  start: Zoned;
  minutes: number;
  work: Work;
}

export interface Proposal {
  task: string;
  day: number;
  start: string;
  minutes: number;
}

export interface Plan {
  now: Zoned;
  hours: number[]; // alertness per hour from the body clock: 0 asleep, else 10–100
  clock: string; // the body clock in words, for the prompt
  preferences: string[]; // the student's own wishes from Options, one line each
  days: Window[];
  ids: Map<string, OpenTask>; // "t1" → task
  busy: Span[]; // the student's events, breaks and sessions that stay where they are
  done: Map<string, number>; // task id → minutes in sessions that stay
  keptDeep: number[]; // per day, deep minutes in sessions that stay
  keptWork: number[]; // per day, all minutes in sessions that stay
  limits: (Limit | null)[]; // per day
  notBefore: Map<string, Zoned>; // task id → earliest start
  /** When only some work moves: the minutes each task may place. Null: plan everything. */
  allowance: Map<string, number> | null;
  /** What to tell the model about what's moving and where it should go. */
  instruction: string;
  current: Placed[]; // the plan before, to keep steady where it can
}

/** Today (from the next quarter hour) through Saturday of next week. */
export function weekFrom(now: Zoned): Window[] {
  const today = now.startOfDay();
  const left = 14 - (now.dayOfWeek % 7); // Sunday → 14 days, Saturday → 8
  return Array.from({ length: left }, (_, d) => ({
    start: d === 0 ? nextStep(now) : today.add({ days: d }),
    end: today.add({ days: d + 1 }),
  }));
}

const ms = (at: Zoned) => at.epochMilliseconds;
const overlaps = (a: Window, b: Window) =>
  ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);

export function awakeMinutes(hours: number[], window: Window): number {
  let minutes = 0;
  let at = window.start;
  while (ms(at) < ms(window.end)) {
    const hourEnd = at
      .round({ smallestUnit: "hour", roundingMode: "floor" })
      .add({ hours: 1 });
    const next = ms(hourEnd) < ms(window.end) ? hourEnd : window.end;
    if (hours[at.hour] >= AWAKE) minutes += minutesBetween(at, next);
    at = next;
  }
  return minutes;
}

function busyMinutes(busy: Span[], window: Window): number {
  return busy.reduce((sum, span) => {
    const start = ms(span.start) > ms(window.start) ? span.start : window.start;
    const end = ms(span.end) < ms(window.end) ? span.end : window.end;
    return sum + Math.max(0, minutesBetween(start, end));
  }, 0);
}

/** Keep the proposed sessions that hold, in time order; drop the rest. */
/**
 * The hard rules, one proposal at a time: `judge` says why a session can't be
 * placed (or null), `place` takes it. Shared by the model's proposals (`check`)
 * and code's gap filling (`fill`), so both meet exactly the same rules.
 */
function checker(plan: Plan) {
  const placed: Placed[] = [];
  const spent = new Map(plan.done);
  const moved = new Map<string, number>();
  const deep = [...plan.keptDeep];
  const work = [...plan.keptWork];
  const used = plan.days.map(() => 0);
  const budget = plan.days.map((day) =>
    Math.max(
      0,
      (awakeMinutes(plan.hours, day) - busyMinutes(plan.busy, day)) *
        (1 - FREE_SHARE),
    ),
  );

  function judge(p: Proposal): { why: string } | { start: Zoned } {
    const task = plan.ids.get(p.task);
    const day = plan.days[p.day];
    if (!task) return { why: "unknown task" };
    if (!day || !Number.isInteger(p.minutes)) return { why: "unknown day" };
    if (p.minutes < SESSION.min || p.minutes > SESSION.max)
      return { why: "length" };
    const start = atClock(day.end.subtract({ days: 1 }), p.start);
    if (!start) return { why: "time" };
    const span = { start, end: addMinutes(start, p.minutes) };
    const wait = plan.notBefore.get(task.id);
    const limit = plan.limits[p.day];
    const allowed = plan.allowance
      ? (moved.get(task.id) ?? 0) + p.minutes <=
        (plan.allowance.get(task.id) ?? 0)
      : (spent.get(task.id) ?? 0) + p.minutes <= (task.minutes ?? SESSION.max);
    const why =
      ms(span.start) < ms(day.start) || ms(span.end) > ms(day.end)
        ? "outside the day"
        : wait && ms(span.start) < ms(wait)
          ? "before its wait"
          : ms(span.end) > ms(task.due)
            ? "after due"
            : hoursTouched(span).some((h) => plan.hours[h] < AWAKE)
              ? "asleep"
              : plan.busy.some((b) => overlaps(b, span))
                ? "over a busy time"
                : placed.some((s) =>
                      overlaps(
                        { start: s.start, end: addMinutes(s.start, s.minutes) },
                        span,
                      ),
                    )
                  ? "over another session"
                  : stretch(span, [
                        ...plan.busy.filter((b) => b.session),
                        ...placed.map((s) => ({
                          start: s.start,
                          end: addMinutes(s.start, s.minutes),
                        })),
                      ]) > STRETCH
                    ? "no rest"
                    : !allowed
                      ? "more than the task's minutes"
                      : task.work === "deep" &&
                          deep[p.day] + p.minutes > DEEP_PER_DAY
                        ? "deep cap"
                        : limit &&
                            (work[p.day] + p.minutes > limit.minutes ||
                              (task.work === "deep" && !limit.deep))
                          ? "lighter day"
                          : used[p.day] + p.minutes > budget[p.day]
                            ? "free third"
                            : null;
    return why ? { why } : { start };
  }

  function place(p: Proposal, start: Zoned) {
    const task = plan.ids.get(p.task);
    if (!task) return;
    placed.push({ task: task.id, start, minutes: p.minutes, work: task.work });
    spent.set(task.id, (spent.get(task.id) ?? 0) + p.minutes);
    moved.set(task.id, (moved.get(task.id) ?? 0) + p.minutes);
    if (task.work === "deep") deep[p.day] += p.minutes;
    work[p.day] += p.minutes;
    used[p.day] += p.minutes;
  }

  /** Minutes the task may still place. */
  function left(taskId: string): number {
    const task = [...plan.ids.values()].find((t) => t.id === taskId);
    if (!task) return 0;
    return plan.allowance
      ? (plan.allowance.get(taskId) ?? 0) - (moved.get(taskId) ?? 0)
      : (task.minutes ?? 0) - (spent.get(taskId) ?? 0);
  }

  return { placed, judge, place, left };
}

/** Minutes of work in the stretch `span` would make with `sessions` (those less than REST apart). */
export function stretch(span: Window, sessions: Window[]): number {
  const all = [...sessions, span].sort((a, b) => ms(a.start) - ms(b.start));
  const at = all.indexOf(span);
  const close = (a: Window, b: Window) =>
    ms(b.start) - ms(a.end) < REST * 60_000;
  let from = at;
  while (from > 0 && close(all[from - 1], all[from])) from--;
  let to = at;
  while (to < all.length - 1 && close(all[to], all[to + 1])) to++;
  return all
    .slice(from, to + 1)
    .reduce((sum, w) => sum + minutesBetween(w.start, w.end), 0);
}

export function check(
  proposals: Proposal[],
  plan: Plan,
  /** Filled with why each dropped proposal was dropped, when given. */
  dropped?: string[],
): Placed[] {
  return checkAndFill(proposals, plan, dropped, false).placed;
}

const FILL_STEP = 15; // minutes between the starts code tries
const BREAK_BETWEEN = 10; // minutes kept clear between sessions it adds
const FILL_MIN = 25; // its shortest session, unless the task needs less

/**
 * The model's proposals through the hard rules, then (with `fill`) the work it
 * left unplaced put into free slots by code: soonest due first, in pieces of
 * about an hour for deep work and 45 minutes for light, each where it scores
 * best: deep work at the most alert hours and light work at lower ones, away
 * from other sessions of the same task and on days that don't have one yet.
 * Every piece meets the same rules, with a break before and after it.
 */
export function checkAndFill(
  proposals: Proposal[],
  plan: Plan,
  dropped?: string[],
  fill = true,
): { placed: Placed[]; filled: number } {
  const c = checker(plan);
  const sorted = [...proposals].sort(
    (a, b) =>
      a.day - b.day ||
      a.start.padStart(5, "0").localeCompare(b.start.padStart(5, "0")),
  );
  for (const p of sorted) {
    const verdict = c.judge(p);
    if ("why" in verdict) dropped?.push(verdict.why);
    else c.place(p, verdict.start);
  }
  if (!fill) return { placed: c.placed, filled: 0 };

  const before = c.placed.length;
  const tasks = [...plan.ids].sort(([, a], [, b]) => ms(a.due) - ms(b.due));
  for (const [tid, task] of tasks) {
    for (let guard = 0; guard < 20; guard++) {
      const left = c.left(task.id);
      if (left < SESSION.min) break;
      const piece = task.work === "deep" ? 60 : 45;
      const minutes =
        left <= SESSION.max && left - piece < FILL_MIN
          ? left
          : Math.max(Math.min(piece, left), Math.min(FILL_MIN, left));
      const best = bestSlot(plan, c, tid, task, minutes);
      if (!best) break;
      c.place(best.p, best.start);
    }
  }
  const filled = c.placed.length - before;
  return { placed: deepAtPeak(c.placed, plan), filled };
}

/**
 * What breaks the softer rules: sessions under a 10-minute break apart, the
 * same task within 30 minutes of itself, and a third session in a row of one
 * task on the same day.
 */
function crowding(sessions: Placed[]): number {
  const sorted = [...sessions].sort((a, b) => ms(a.start) - ms(b.start));
  let count = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const before = sorted[i - 1];
    const gap =
      (ms(sorted[i].start) - ms(addMinutes(before.start, before.minutes))) /
      60_000;
    const sameDay = before.start
      .toPlainDate()
      .equals(sorted[i].start.toPlainDate());
    if (gap < BREAK_BETWEEN) count++;
    if (before.task === sorted[i].task && gap < 30) count++;
    run = sameDay && before.task === sorted[i].task ? run + 1 : 1;
    if (run >= 3) count++;
  }
  return count;
}

/**
 * Within each day, a deep session and a light one trade start times when that
 * puts the deep work at a more alert hour and every hard rule still holds (the
 * synchrony effect, made sure of in code) and no break or variety is lost.
 * Repeats until nothing improves.
 */
function deepAtPeak(placed: Placed[], plan: Plan): Placed[] {
  const tidOf = new Map([...plan.ids].map(([tid, task]) => [task.id, tid]));
  const alertness = (start: Zoned, minutes: number) => {
    const hours = hoursTouched({ start, end: addMinutes(start, minutes) });
    return hours.reduce((sum, h) => sum + plan.hours[h], 0) / hours.length;
  };
  const asProposals = (sessions: Placed[]): Proposal[] =>
    sessions.map((s) => ({
      task: tidOf.get(s.task) ?? "",
      day: plan.days.findIndex((d) => ms(s.start) < ms(d.end)),
      start: hhmm(s.start),
      minutes: s.minutes,
    }));
  let current = placed;
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (const deep of current.filter((s) => s.work === "deep")) {
      for (const light of current.filter((s) => s.work === "light")) {
        if (!deep.start.toPlainDate().equals(light.start.toPlainDate()))
          continue;
        const gain =
          alertness(light.start, deep.minutes) -
          alertness(deep.start, deep.minutes);
        if (gain <= 5) continue;
        const swapped = current.map((s) =>
          s === deep
            ? { ...s, start: light.start }
            : s === light
              ? { ...s, start: deep.start }
              : s,
        );
        if (
          crowding(swapped) <= crowding(current) &&
          check(asProposals(swapped), plan).length === swapped.length
        ) {
          current = swapped;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (!improved) break;
  }
  return current;
}

function bestSlot(
  plan: Plan,
  c: ReturnType<typeof checker>,
  tid: string,
  task: OpenTask,
  minutes: number,
): { p: Proposal; start: Zoned } | null {
  let best: { p: Proposal; start: Zoned; score: number } | null = null;
  for (const [d, day] of plan.days.entries()) {
    if (ms(day.start) >= ms(task.due)) break;
    const from = nextStep(day.start, FILL_STEP);
    for (
      let at = from;
      ms(addMinutes(at, minutes)) <= ms(day.end);
      at = addMinutes(at, FILL_STEP)
    ) {
      const p = { task: tid, day: d, start: hhmm(at), minutes };
      const verdict = c.judge(p);
      if ("why" in verdict) continue;
      const span = {
        start: verdict.start,
        end: addMinutes(verdict.start, minutes),
      };
      const padded = {
        start: addMinutes(span.start, -BREAK_BETWEEN),
        end: addMinutes(span.end, BREAK_BETWEEN),
      };
      // A break before and after, from this run's sessions and from what
      // stays (sessions, classes, other plans) alike.
      const near = [
        ...c.placed.map((s) => ({
          start: s.start,
          end: addMinutes(s.start, s.minutes),
        })),
        ...plan.busy,
      ].filter((s) => overlaps(s, padded));
      if (near.length) continue;
      const alert =
        hoursTouched(span).reduce((sum, h) => sum + plan.hours[h], 0) /
        hoursTouched(span).length;
      const sameTask = c.placed.filter((s) => s.task === task.id);
      const sameDay = sameTask.some((s) =>
        s.start.toPlainDate().equals(span.start.toPlainDate()),
      );
      const touching = sameTask.some(
        (s) =>
          Math.abs(ms(s.start) - ms(span.end)) < 30 * 60_000 ||
          Math.abs(ms(addMinutes(s.start, s.minutes)) - ms(span.start)) <
            30 * 60_000,
      );
      const score =
        (task.work === "deep" ? alert : 100 - Math.abs(alert - 60)) -
        (sameDay ? 25 : 0) -
        (touching ? 40 : 0) -
        d;
      if (!best || score > best.score)
        best = { p, start: verdict.start, score };
    }
  }
  return best;
}

function hoursTouched(span: Window): number[] {
  const last = span.end.subtract({ minutes: 1 }).hour;
  return Array.from(
    { length: last - span.start.hour + 1 },
    (_, i) => span.start.hour + i,
  );
}

const LONG_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

export function message(plan: Plan): string {
  const { now } = plan;
  const ids = new Map([...plan.ids].map(([tid, task]) => [task.id, tid]));
  const lines = [
    `Now: ${LONG_DAY.format(new Date(now.epochMilliseconds))}, ${hhmm(now)}. The plan runs through Saturday of next week.`,
    "",
    "Days:",
  ];
  for (const [d, day] of plan.days.entries()) {
    const busy = plan.busy
      .filter((b) => overlaps(b, day))
      .map((b) => `${hhmm(b.start)}–${hhmm(b.end)} ${b.label}`);
    const open =
      ms(day.start) < ms(day.end) ? `open ${hhmm(day.start)}–24:00` : "closed";
    const limit = plan.limits[d];
    lines.push(
      [
        `${d}`,
        shortDate(day.end.subtract({ days: 1 })),
        open,
        limit
          ? `lighter day: at most ${durationText(limit.minutes)} of work${limit.deep ? "" : ", no deep work"}`
          : "",
        busy.length ? `busy ${busy.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
  lines.push(
    "",
    `Body clock: ${plan.clock}.`,
    "Alertness by hour (0 = asleep, 100 = sharpest), the same every day:",
    plan.hours
      .map((value, h) => `${String(h).padStart(2, "0")}:00 ${value}`)
      .join(" · "),
    ...(plan.preferences.length
      ? [
          "",
          "The student's preferences:",
          ...plan.preferences.map((p) => `- ${p}`),
        ]
      : []),
    "",
    "Tasks (number · due · minutes · deep or light · course · title):",
  );
  for (const [tid, task] of plan.ids) {
    const done = plan.done.get(task.id) ?? 0;
    const left = plan.allowance
      ? `${plan.allowance.get(task.id) ?? 0} min to place`
      : task.minutes !== null
        ? `${task.minutes - done} min left`
        : "time unknown";
    const wait = plan.notBefore.get(task.id);
    lines.push(
      [
        tid,
        `due ${dueText(task.due, now)}`,
        left,
        task.work,
        task.course ?? "",
        task.title,
        task.detail ? `(${task.detail})` : "",
        wait && ms(wait) > ms(now)
          ? `not before ${hhmm(wait)} ${wait.toPlainDate().equals(now.toPlainDate()) ? "today" : shortDate(wait)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
  if (plan.current.length) {
    lines.push(
      "",
      plan.preferences.length
        ? "The plan before (keep what already follows the student's preferences; change the rest to follow them):"
        : "The plan before (keep it steady where you can):",
    );
    for (const s of plan.current) {
      const tid = ids.get(s.task);
      const d = plan.days.findIndex((day) => ms(s.start) < ms(day.end));
      if (tid && d >= 0)
        lines.push(
          `task ${tid} · day ${d} · ${hhmm(s.start)} · ${s.minutes} min`,
        );
    }
  }
  lines.push("", plan.instruction);
  return lines.join("\n");
}

function dueText(due: Zoned, now: Zoned): string {
  const days = now.toPlainDate().until(due.toPlainDate()).days;
  if (days === 0) return `today ${hhmm(due)}`;
  if (days === 1) return `tomorrow ${hhmm(due)}`;
  return `${shortDate(due)} ${hhmm(due)} (in ${days} days)`;
}
