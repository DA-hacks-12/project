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
// `check` keeps only those that hold. A plan covers this school week: today
// through Saturday (weeks start on Sunday).

export const HORIZON_DAYS = 14; // tasks due this far out can already get time
export const AWAKE = 10; // an hour with a smaller active share is never used
export const SESSION = { min: 10, max: 120 }; // minutes
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
  hours: number[];
  learned: boolean; // false: default hours, the extension hasn't learned any
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

/** Today (from the next quarter hour) through Saturday. */
export function weekFrom(now: Zoned): Window[] {
  const today = now.startOfDay();
  const left = 7 - (now.dayOfWeek % 7); // Sunday → 7 days, Saturday → 1
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
export function check(proposals: Proposal[], plan: Plan): Placed[] {
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
  const sorted = [...proposals].sort(
    (a, b) =>
      a.day - b.day ||
      a.start.padStart(5, "0").localeCompare(b.start.padStart(5, "0")),
  );

  for (const p of sorted) {
    const task = plan.ids.get(p.task);
    const day = plan.days[p.day];
    if (!task || !day || !Number.isInteger(p.minutes)) continue;
    if (p.minutes < SESSION.min || p.minutes > SESSION.max) continue;
    const start = atClock(day.end.subtract({ days: 1 }), p.start);
    if (!start) continue;
    const span = { start, end: addMinutes(start, p.minutes) };
    const wait = plan.notBefore.get(task.id);
    const total = (spent.get(task.id) ?? 0) + p.minutes;
    const limit = plan.limits[p.day];
    const allowed = plan.allowance
      ? (moved.get(task.id) ?? 0) + p.minutes <=
        (plan.allowance.get(task.id) ?? 0)
      : total <= (task.minutes ?? SESSION.max);
    if (
      ms(span.start) < ms(day.start) ||
      (wait && ms(span.start) < ms(wait)) ||
      ms(span.end) > ms(day.end) ||
      ms(span.end) > ms(task.due) ||
      hoursTouched(span).some((h) => plan.hours[h] < AWAKE) ||
      plan.busy.some((b) => overlaps(b, span)) ||
      placed.some((s) =>
        overlaps({ start: s.start, end: addMinutes(s.start, s.minutes) }, span),
      ) ||
      !allowed ||
      (task.work === "deep" && deep[p.day] + p.minutes > DEEP_PER_DAY) ||
      (limit &&
        (work[p.day] + p.minutes > limit.minutes ||
          (task.work === "deep" && !limit.deep))) ||
      used[p.day] + p.minutes > budget[p.day]
    ) {
      continue;
    }
    placed.push({ task: task.id, start, minutes: p.minutes, work: task.work });
    spent.set(task.id, total);
    moved.set(task.id, (moved.get(task.id) ?? 0) + p.minutes);
    if (task.work === "deep") deep[p.day] += p.minutes;
    work[p.day] += p.minutes;
    used[p.day] += p.minutes;
  }
  return placed;
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
    `Now: ${LONG_DAY.format(new Date(now.epochMilliseconds))}, ${hhmm(now)}. The school week ends on Saturday.`,
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
    ...(plan.learned
      ? [
          "Active hours (share of recent days on the laptop), the same every day:",
          plan.hours
            .map((share, h) => `${String(h).padStart(2, "0")}:00 ${share}%`)
            .join(" · "),
        ]
      : [
          `Active hours aren't known yet: treat ${plan.hours.findIndex((h) => h > 0)}:00 to ${plan.hours.findLastIndex((h) => h > 0) + 1}:00 as open, with no hour preferred over another.`,
        ]),
    "",
    "Tasks:",
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
    lines.push("", "The plan before (keep it steady where you can):");
    for (const s of plan.current) {
      const tid = ids.get(s.task);
      const d = plan.days.findIndex((day) => ms(s.start) < ms(day.end));
      if (tid && d >= 0)
        lines.push(`${tid} · day ${d} · ${hhmm(s.start)} · ${s.minutes} min`);
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
