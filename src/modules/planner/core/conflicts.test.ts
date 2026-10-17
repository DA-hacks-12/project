import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import { conflictOf } from "./conflicts";
import type { BlockRow, TaskRow } from "./queries";

const TZ = "America/Los_Angeles";
const at = (time: string) => zoned(`2026-10-16T${time}:00-07:00`, TZ);

const block = (
  id: string,
  kind: string,
  time: string,
  minutes: number,
  extra: Partial<BlockRow> = {},
) =>
  ({
    id,
    kind,
    start: at(time).toInstant().toString(),
    minutes,
    task_id: null,
    title: null,
    ...extra,
  }) as BlockRow;

const TASKS = [
  { id: "ps4", title: "Problem Set 4", due: "2026-10-16T23:59:00-07:00" },
  { id: "essay", title: "Essay 2", due: "2026-10-16T17:00:00-07:00" },
] as TaskRow[];

const BLOCKS = [
  block("s1", "session", "14:00", 60, { task_id: "ps4" }),
  block("shift", "event", "18:00", 120, { title: "Shift at the library" }),
  block("nap", "break", "16:00", 20),
  block("walk", "nature", "16:30", 40),
];

test("a session can't overlap a session, an event or a break, and says which", () => {
  const session = (time: string, minutes: number) =>
    conflictOf(
      { kind: "session", start: at(time), minutes, id: "x", taskId: "ps4" },
      BLOCKS,
      TASKS,
    );
  expect(session("14:30", 30)).toBe("Overlaps Problem Set 4, 2:00–3:00pm");
  expect(session("17:30", 60)).toBe(
    "Overlaps Shift at the library, 6:00–8:00pm",
  );
  expect(session("15:50", 20)).toBe("Overlaps a break, 4:00–4:20pm");
  expect(session("15:00", 60)).toBeNull(); // touching ends are fine
  expect(session("16:30", 40)).toBeNull(); // a nature suggestion gives way
});

test("a session edited into its own old time, or past its due time", () => {
  expect(
    conflictOf(
      {
        kind: "session",
        start: at("14:15"),
        minutes: 30,
        id: "s1",
        taskId: "ps4",
      },
      BLOCKS,
      TASKS,
    ),
  ).toBeNull();
  expect(
    conflictOf(
      { kind: "session", start: at("16:30"), minutes: 45, taskId: "essay" },
      BLOCKS,
      TASKS,
    ),
  ).toBe("Ends after it's due");
});

test("an event can't overlap an event or a break; planned work moves instead", () => {
  const event = (time: string, minutes: number) =>
    conflictOf({ kind: "event", start: at(time), minutes }, BLOCKS, TASKS);
  expect(event("19:00", 60)).toBe("Overlaps Shift at the library, 6:00–8:00pm");
  expect(event("16:10", 30)).toBe("Overlaps a break, 4:00–4:20pm");
  expect(event("14:00", 60)).toBeNull();
});
