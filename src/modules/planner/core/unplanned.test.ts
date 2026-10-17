import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import { isPlanning, unplanned } from "./items";
import type { Planner } from "./queries";

const TZ = "America/Los_Angeles";
const NOW = zoned("2026-10-16T19:00:00Z", TZ); // Friday noon
const UNTIL = zoned("2026-10-25T07:00:00Z", TZ); // end of next Saturday

const task = (id: string, due: string, minutes: number | null, extra = {}) => ({
  id,
  title: id,
  due,
  minutes,
  read: true,
  done: false,
  feed_id: "f",
  ...extra,
});
const session = (task_id: string, minutes: number) => ({
  id: `${task_id}-${minutes}`,
  kind: "session",
  task_id,
  start: "2026-10-17T17:00:00Z",
  minutes,
});

const planner = (tasks: unknown[], blocks: unknown[], feeds: unknown[] = []) =>
  ({ tasks, blocks, feeds }) as unknown as Planner;

test("unplanned: open work in the plan's span, with the minutes not placed", () => {
  const p = planner(
    [
      task("essay", "2026-10-20T06:59:00Z", 240), // 90 placed → 150 left
      task("quiz", "2026-10-18T06:59:00Z", 30), // all placed
      task("lab", "2026-10-22T06:59:00Z", 120), // none placed
      task("done", "2026-10-19T06:59:00Z", 60, { done: true }),
      task("unread", "2026-10-19T06:59:00Z", 60, { read: false }),
      task("far", "2026-10-30T06:59:00Z", 60), // after the plan's last day
      task("past", "2026-10-15T06:59:00Z", 60),
      task("tiny", "2026-10-19T06:59:00Z", 35), // 5 left: not worth listing
    ],
    [session("essay", 90), session("quiz", 30), session("tiny", 30)],
  );
  expect(
    unplanned(p, NOW, UNTIL).map(({ task, left }) => `${task.id} ${left}`),
  ).toEqual(["essay 150", "lab 120"]);
});

test("planning: an import newer than its plan, for a few minutes", () => {
  const at = Date.parse("2026-10-16T19:00:00Z");
  const feed = (imported_at: string, planned_at: string | null) => ({
    imported_at,
    planned_at,
  });
  expect(
    isPlanning(planner([], [], [feed("2026-10-16T18:59:00Z", null)]), at),
  ).toBe(true);
  expect(
    isPlanning(
      planner([], [], [feed("2026-10-16T18:59:00Z", "2026-10-16T18:59:40Z")]),
      at,
    ),
  ).toBe(false);
  expect(
    isPlanning(planner([], [], [feed("2026-10-16T18:40:00Z", null)]), at),
  ).toBe(false); // too long ago: stop watching
});
