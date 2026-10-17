import { clockRange, type Zoned, zoned } from "@/lib/time";
import { type ClassRule, classTimes } from "@/modules/classes/core/classes";
import type { BlockRow, TaskRow } from "./queries";

// What a time the student sets by hand would clash with. A session can't
// overlap another session, an event, a break or a class, and can't end after
// its task is due. An event can't overlap another event, a break or a class; planned work under
// it moves out of the way instead (Reschedule, scope clash). Nature
// suggestions never count: they're planned again around the new time.

export interface Placing {
  kind: "session" | "event";
  start: Zoned;
  minutes: number;
  id?: string; // the block being edited, which can't clash with itself
  taskId?: string | null;
}

/** Why this time can't be saved, in a few words; null when it can. */
export function conflictOf(
  placing: Placing,
  blocks: BlockRow[],
  tasks: TaskRow[],
  classes: ClassRule[] = [],
): string | null {
  const tz = placing.start.timeZoneId;
  const from = placing.start.epochMilliseconds;
  const to = from + placing.minutes * 60_000;
  const blocking =
    placing.kind === "session"
      ? ["session", "event", "break"]
      : ["event", "break"];
  const titles = new Map(tasks.map((t) => [t.id, t.title]));
  const hit = [
    ...blocks
      .filter((b) => b.id !== placing.id && blocking.includes(b.kind))
      .map((b) => {
        const start = zoned(b.start, tz);
        const name =
          b.kind === "session"
            ? (titles.get(b.task_id ?? "") ?? "a session")
            : b.kind === "break"
              ? "a break"
              : (b.title ?? "an event");
        return { name, start, end: start.add({ minutes: b.minutes }) };
      }),
    ...classTimes(
      classes,
      placing.start,
      placing.start.add({ minutes: placing.minutes }),
    ).map((c) => ({ name: c.rule.title, start: c.start, end: c.end })),
  ]
    .filter(
      ({ start, end }) =>
        start.epochMilliseconds < to && end.epochMilliseconds > from,
    )
    .sort((x, y) => x.start.epochMilliseconds - y.start.epochMilliseconds)[0];
  if (hit) return `Overlaps ${hit.name}, ${clockRange(hit.start, hit.end)}`;
  if (placing.kind === "session" && placing.taskId) {
    const task = tasks.find((t) => t.id === placing.taskId);
    if (task && to > Date.parse(task.due)) return "Ends after it's due";
  }
  return null;
}
