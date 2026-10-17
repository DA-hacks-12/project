import { Temporal } from "temporal-polyfill";
import { addMinutes, type Zoned, zoned } from "@/lib/time";
import {
  type BodyClock,
  isSharp,
  sharpestText,
} from "@/modules/arrange/core/body-clock";
import { type ClassRule, classesOn } from "@/modules/classes/core/classes";
import { type NatureStop, natureStopOf } from "@/modules/suggest/core/places";
import type { BlockRow, Planner, TaskRow } from "./queries";

// What a day shows: its blocks (sessions, breaks, the student's events, nature
// suggestions), the classes that meet that day, and the assignments due that
// day. Plain code, the same every time.

interface Timed {
  key: string;
  start: Zoned;
  end: Zoned;
}

export type Item =
  | (Timed & { kind: "session"; block: BlockRow; task: TaskRow | undefined })
  | (Timed & { kind: "break"; block: BlockRow })
  | (Timed & { kind: "event"; block: BlockRow })
  | (Timed & { kind: "nature"; block: BlockRow; place: NatureStop })
  | (Timed & { kind: "class"; rule: ClassRule });

export interface DayView {
  items: Item[];
  due: TaskRow[];
}

export function timeZoneOf(planner: Planner): string {
  return planner.settings?.time_zone && planner.settings.time_zone !== "UTC"
    ? planner.settings.time_zone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function dayView(
  planner: Planner,
  date: Temporal.PlainDate,
  now: Zoned,
): DayView {
  const tz = now.timeZoneId;
  const tasks = new Map(planner.tasks.map((t) => [t.id, t]));
  const items: Item[] = [];
  for (const block of planner.blocks) {
    const start = zoned(block.start, tz);
    if (!start.toPlainDate().equals(date)) continue;
    const base = {
      key: block.id,
      start,
      end: addMinutes(start, block.minutes),
      block,
    };
    if (block.kind === "session")
      items.push({
        ...base,
        kind: "session",
        task: tasks.get(block.task_id ?? ""),
      });
    else if (block.kind === "break") items.push({ ...base, kind: "break" });
    else if (block.kind === "nature") {
      const place = natureStopOf(block.place);
      if (place) items.push({ ...base, kind: "nature", place });
    } else items.push({ ...base, kind: "event" });
  }
  for (const time of classesOn(planner.classes ?? [], date, tz))
    items.push({ ...time, kind: "class" });

  items.sort((a, b) => a.start.epochMilliseconds - b.start.epochMilliseconds);

  const due = planner.tasks.filter((t) =>
    zoned(t.due, tz).toPlainDate().equals(date),
  );
  return { items, due };
}

export function current(items: Item[], now: Zoned): Item | undefined {
  const at = now.epochMilliseconds;
  return items.find(
    (i) =>
      i.kind !== "nature" &&
      i.start.epochMilliseconds <= at &&
      at < i.end.epochMilliseconds,
  );
}

/**
 * Why a session sits where it does, in the student's terms, only where it's
 * true: deep work in their sharpest hours, light work kept out of them, and a
 * long task spread over days. Plain code over the saved plan.
 */
export function whyHere(
  item: Extract<Item, { kind: "session" }>,
  planner: Planner,
  clock: BodyClock,
): string[] {
  const task = item.task;
  if (!task) return [];
  const reasons: string[] = [];
  const hours: number[] = [];
  for (
    let at = item.start;
    at.epochMilliseconds < item.end.epochMilliseconds;
    at = at.add({ minutes: 30 })
  )
    hours.push(at.hour);
  const sharp = hours.filter((h) => isSharp(clock, h)).length / hours.length;
  if (task.work === "deep" && sharp >= 0.5)
    reasons.push(`Deep work in your sharpest hours, ${sharpestText(clock)}`);
  if (task.work === "light" && sharp < 0.5)
    reasons.push("Light work, leaving your sharpest hours for deep work");
  const tz = item.start.timeZoneId;
  const sessions = planner.blocks
    .filter((b) => b.kind === "session" && b.task_id === task.id)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const days = new Set(
    sessions.map((b) => zoned(b.start, tz).toPlainDate().toString()),
  );
  if (sessions.length >= 2 && days.size >= 2) {
    const part = sessions.findIndex((b) => b.id === item.block.id) + 1;
    reasons.push(
      `Part ${part} of ${sessions.length}, spread over ${days.size} days before it's due`,
    );
  }
  return reasons;
}

/** What's being replanned right now: a Reschedule under way, or the plan after an import. */
export type Replanning =
  | { scope: "week"; dismiss?: string }
  // `day`: the day chosen (YYYY-MM-DD), today when missing.
  | { scope: "day"; day?: string; dismiss?: string }
  | { scope: "clash"; start: string; end: string };

/** The day a Day replan works on. */
const dayOf = (replanning: { day?: string }, now: Zoned) =>
  replanning.day ? Temporal.PlainDate.from(replanning.day) : now.toPlainDate();

/**
 * The part of `date` a replan works on, for the calendar to show it: the
 * chosen day (from now if it's today), every day left in the plan, the
 * clash's own window, or nothing.
 */
export function replanSpan(
  replanning: Replanning,
  date: Temporal.PlainDate,
  now: Zoned,
  planEnd: Zoned,
): { from: Zoned; to: Zoned } | null {
  const tz = now.timeZoneId;
  const dayStart = date.toZonedDateTime({ timeZone: tz });
  const dayEnd = dayStart.add({ days: 1 });
  const today = now.toPlainDate();
  if (replanning.scope === "clash") {
    const from = zoned(replanning.start, tz);
    const to = zoned(replanning.end, tz);
    return from.toPlainDate().equals(date) ? { from, to } : null;
  }
  if (replanning.scope === "week") {
    if (
      date.until(today).days > 0 ||
      dayStart.epochMilliseconds >= planEnd.epochMilliseconds
    )
      return null;
    return { from: date.equals(today) ? now : dayStart, to: dayEnd };
  }
  if (!date.equals(dayOf(replanning, now))) return null;
  return { from: date.equals(today) ? now : dayStart, to: dayEnd };
}

/** Whether a block may move in this replan (to show it working). */
export function mayMove(
  item: Item,
  replanning: Replanning,
  now: Zoned,
): boolean {
  if (item.kind !== "session" || item.block.done) return false;
  const start = item.start.epochMilliseconds;
  const end = item.end.epochMilliseconds;
  const at = now.epochMilliseconds;
  if ("dismiss" in replanning && replanning.dismiss === item.block.id)
    return true;
  switch (replanning.scope) {
    case "week":
      return start >= at;
    case "day":
      return (
        item.start.toPlainDate().equals(dayOf(replanning, now)) && end > at
      );
    case "clash":
      return (
        start >= at &&
        start < Date.parse(replanning.end) &&
        end > Date.parse(replanning.start)
      );
  }
}

/** The sharpest stretch as hour runs inside one day: [[14, 20]], or [[22, 24], [0, 2]]. */
export function sharpRuns(clock: BodyClock): [number, number][] {
  const [first, end] = clock.sharpest;
  return first < end
    ? [[first, end]]
    : [
        [first, 24],
        [0, end],
      ];
}

export function titleOf(item: Item): string {
  switch (item.kind) {
    case "session":
      return item.task?.title ?? "Session";
    case "break":
      return item.block.rest ? REST_TITLE[item.block.rest] : "Break";
    case "event":
      return item.block.title ?? "Event";
    case "nature":
      return item.place.name;
    case "class":
      return item.rule.title;
  }
}

const REST_TITLE: Record<string, string> = {
  nap: "Nap",
  walk: "Walk outside",
  eat: "Eat",
  move: "Move",
};

/** The open tasks that matter most: due soonest, then the most work left. */
export function biggestPriority(
  planner: Planner,
  now: Zoned,
  count = 3,
): TaskRow[] {
  const at = now.epochMilliseconds;
  return planner.tasks
    .filter((t) => !t.done && Date.parse(t.due) > at)
    .sort(
      (a, b) =>
        Date.parse(a.due) - Date.parse(b.due) ||
        (b.minutes ?? 0) - (a.minutes ?? 0),
    )
    .slice(0, count);
}

/** How long after an import the page keeps watching for readings to land. */
export const READING_WINDOW_MS = 3 * 60_000;
/** And for the work it brought to be planned (reading, then a plan). */
export const PLANNING_WINDOW_MS = 5 * 60_000;

/** An import's new work is still being planned (after it was read). */
export function isPlanning(planner: Planner, at = Date.now()): boolean {
  return planner.feeds.some(
    (f) =>
      !!f.imported_at &&
      at - Date.parse(f.imported_at) < PLANNING_WINDOW_MS &&
      (!f.planned_at || Date.parse(f.planned_at) < Date.parse(f.imported_at)),
  );
}

/**
 * The open tasks whose work isn't all placed yet, with the minutes left:
 * read, not done, due after now and by the plan's last day. Every session
 * counts, past ones too.
 */
export function unplanned(
  planner: Planner,
  now: Zoned,
  until: Zoned,
): { task: TaskRow; left: number }[] {
  return planner.tasks
    .filter(
      (t) =>
        t.read &&
        !t.done &&
        t.minutes &&
        Date.parse(t.due) > now.epochMilliseconds &&
        Date.parse(t.due) <= until.epochMilliseconds,
    )
    .map((task) => {
      const planned = planner.blocks
        .filter((b) => b.kind === "session" && b.task_id === task.id)
        .reduce((sum, b) => sum + b.minutes, 0);
      return { task, left: (task.minutes ?? 0) - planned };
    })
    .filter(({ left }) => left >= 10)
    .sort((a, b) => Date.parse(a.task.due) - Date.parse(b.task.due));
}

/** The model is reading this task right now: unread, from a school just imported. */
export function isReading(
  planner: Planner,
  task: TaskRow,
  at = Date.now(),
): boolean {
  if (task.read) return false;
  const feed = planner.feeds.find((f) => f.id === task.feed_id);
  return (
    !!feed?.imported_at && at - Date.parse(feed.imported_at) < READING_WINDOW_MS
  );
}
