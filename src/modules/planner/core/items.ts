import { Temporal } from "temporal-polyfill";
import { addMinutes, type Zoned, zoned } from "@/lib/time";
import { hoursOf } from "@/modules/arrange/core/hours";
import { freeTime, type Idea } from "@/modules/suggest/core/free-time";
import { type BlockRow, type Planner, placesOf, type TaskRow } from "./queries";

// What a day shows: its blocks (sessions, breaks, the student's events), free
// time ideas, and the assignments due that day. Plain code, the same every time.

interface Timed {
  key: string;
  start: Zoned;
  end: Zoned;
}

export type Item =
  | (Timed & { kind: "session"; block: BlockRow; task: TaskRow | undefined })
  | (Timed & { kind: "break"; block: BlockRow })
  | (Timed & { kind: "event"; block: BlockRow })
  | (Timed & { kind: "idea"; idea: Idea });

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
    else items.push({ ...base, kind: "event" });
  }

  const today = now.toPlainDate();
  const { hours } = hoursOf(planner.settings?.active_hours);
  if (Temporal.PlainDate.compare(date, today) >= 0) {
    const from = date.equals(today)
      ? now
      : date.toZonedDateTime({ timeZone: tz });
    for (const idea of freeTime(
      items,
      hours,
      from,
      placesOf(planner.settings),
    )) {
      items.push({
        kind: "idea",
        key: `idea-${idea.start.epochMilliseconds}`,
        start: idea.start,
        end: addMinutes(idea.start, idea.minutes),
        idea,
      });
    }
  }
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
      i.kind !== "idea" &&
      i.start.epochMilliseconds <= at &&
      at < i.end.epochMilliseconds,
  );
}

export function titleOf(item: Item): string {
  switch (item.kind) {
    case "session":
      return item.task?.title ?? "Session";
    case "break":
      return item.block.rest ? REST_TITLE[item.block.rest] : "Break";
    case "event":
      return item.block.title ?? "Event";
    case "idea":
      return item.idea.words;
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

/** The session to focus on now: the one under way, else the next one today. */
export function focusTarget(
  planner: Planner,
  now: Zoned,
): BlockRow | undefined {
  const { items } = dayView(planner, now.toPlainDate(), now);
  const sessions = items.filter((i) => i.kind === "session" && !i.block.done);
  const at = now.epochMilliseconds;
  const next = sessions.find((i) => i.end.epochMilliseconds > at);
  return next && "block" in next ? next.block : undefined;
}

/** How long after an import the page keeps watching for readings to land. */
export const READING_WINDOW_MS = 3 * 60_000;

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
