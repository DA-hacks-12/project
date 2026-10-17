import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import type { OpenTask } from "./plan";
import { weekSoFar } from "./week-so-far";

const TZ = "America/Los_Angeles";
const HOURS = [...Array(8).fill(5), ...Array(16).fill(60)]; // asleep until 8am
const NOW = zoned("2026-10-15T21:00:00Z", TZ); // Thursday 2pm

const task = (
  id: string,
  due: string,
  minutes: number,
  work: "deep" | "light",
): OpenTask => ({
  id,
  title: id,
  course: id,
  detail: null,
  due: zoned(due, TZ),
  minutes,
  work,
});

test("the week so far: each task's work, in the two days before it was due, awake, by now", () => {
  const tasks = [
    task("lab", "2026-10-14T06:59:00Z", 180, "deep"), // Tuesday 11:59pm
    task("quiz", "2026-10-13T03:00:00Z", 30, "light"), // Monday 8pm
    task("reading", "2026-10-16T06:59:00Z", 60, "light"), // tonight
  ];
  const placed = weekSoFar(tasks, NOW, HOURS, []);
  for (const t of tasks) {
    const mine = placed.filter((s) => s.task === t.id);
    expect(mine.reduce((sum, s) => sum + s.minutes, 0)).toBe(t.minutes);
    for (const s of mine) {
      const end = s.start.add({ minutes: s.minutes });
      expect(end.epochMilliseconds).toBeLessThanOrEqual(
        t.due.epochMilliseconds,
      );
      expect(s.start.epochMilliseconds).toBeGreaterThanOrEqual(
        t.due.startOfDay().subtract({ days: 2 }).epochMilliseconds,
      );
      expect(s.start.hour).toBeGreaterThanOrEqual(8);
      expect(end.epochMilliseconds).toBeLessThanOrEqual(NOW.epochMilliseconds);
    }
  }
});

test("today's work done so far was done today", () => {
  const placed = weekSoFar(
    [task("reading", "2026-10-16T06:59:00Z", 60, "light")], // tonight
    NOW,
    HOURS,
    [],
  );
  expect(placed.length).toBeGreaterThan(0);
  expect(
    placed.every((s) => s.start.toPlainDate().equals(NOW.toPlainDate())),
  ).toBe(true);
});
