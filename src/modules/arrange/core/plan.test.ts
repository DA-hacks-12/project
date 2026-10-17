import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import { check, message, type OpenTask, type Plan, weekFrom } from "./plan";
import { preferenceRules } from "./preferences";

const TZ = "America/Los_Angeles";
const NOW = zoned("2026-10-16T21:00:00Z", TZ); // Friday 2pm
const HOURS = [...Array(8).fill(5), ...Array(16).fill(60)]; // asleep until 8am

function task(
  id: string,
  minutes = 120,
  work: "deep" | "light" = "deep",
  due = "2026-10-20T06:59:00Z",
): OpenTask {
  return {
    id,
    title: id,
    course: "PSYC",
    detail: null,
    due: zoned(due, TZ),
    minutes,
    work,
  };
}

function plan(tasks: OpenTask[], extra: Partial<Plan> = {}): Plan {
  const days = weekFrom(NOW);
  return {
    now: NOW,
    hours: HOURS,
    clock: "Up around 8am, asleep around 11pm",
    preferences: [],
    days,
    ids: new Map(tasks.map((t, n) => [`t${n + 1}`, t])),
    busy: [],
    done: new Map(),
    keptDeep: days.map(() => 0),
    keptWork: days.map(() => 0),
    limits: days.map(() => null),
    notBefore: new Map(),
    allowance: null,
    instruction: "",
    current: [],
    ...extra,
  };
}

const starts = (placed: ReturnType<typeof check>) =>
  placed.map(
    (s) =>
      `${s.task} ${s.start.dayOfWeek} ${s.start.hour}:${String(s.start.minute).padStart(2, "0")}`,
  );

test("a plan covers the school week: today through Saturday", () => {
  expect(weekFrom(NOW)).toHaveLength(2); // Friday, Saturday
  expect(weekFrom(zoned("2026-10-18T19:00:00Z", TZ))).toHaveLength(7); // Sunday
  expect(weekFrom(zoned("2026-10-17T19:00:00Z", TZ))).toHaveLength(1); // Saturday
  expect(weekFrom(NOW)[1].end.toPlainDate().toString()).toBe("2026-10-18");
});

test("keeps sessions that hold across days", () => {
  const placed = check(
    [
      { task: "t1", day: 0, start: "15:00", minutes: 60 },
      { task: "t2", day: 1, start: "10:00", minutes: 45 },
    ],
    plan([task("a"), task("b", 60, "light")]),
  );
  expect(starts(placed)).toEqual(["a 5 15:00", "b 6 10:00"]);
});

test("drops the past, overlaps, asleep hours, unknown tasks, bad times and days past Saturday", () => {
  const placed = check(
    [
      { task: "t1", day: 0, start: "13:00", minutes: 30 },
      { task: "t1", day: 0, start: "15:00", minutes: 60 },
      { task: "t2", day: 0, start: "15:30", minutes: 30 },
      { task: "t2", day: 1, start: "06:00", minutes: 30 },
      { task: "t9", day: 1, start: "10:00", minutes: 30 },
      { task: "t2", day: 1, start: "25:00", minutes: 30 },
      { task: "t2", day: 2, start: "10:00", minutes: 30 },
    ],
    plan([task("a"), task("b")]),
  );
  expect(starts(placed)).toEqual(["a 5 15:00"]);
});

test("stays off busy times and after due times", () => {
  const busy = [
    {
      start: zoned("2026-10-17T17:00:00Z", TZ),
      end: zoned("2026-10-17T19:00:00Z", TZ),
      label: "Work",
    },
  ];
  const placed = check(
    [
      { task: "t1", day: 1, start: "10:30", minutes: 60 },
      { task: "t2", day: 0, start: "17:30", minutes: 60 },
      { task: "t1", day: 1, start: "13:00", minutes: 60 },
    ],
    plan([task("a"), task("b", 60, "deep", "2026-10-17T01:00:00Z")], { busy }),
  );
  expect(starts(placed)).toEqual(["a 6 13:00"]);
});

test("caps deep work at four hours a day and a dismissed task waits", () => {
  const notBefore = new Map([["a", zoned("2026-10-16T22:30:00Z", TZ)]]);
  const placed = check(
    [
      { task: "t1", day: 0, start: "15:00", minutes: 30 },
      { task: "t2", day: 0, start: "15:00", minutes: 120 },
      { task: "t1", day: 0, start: "17:30", minutes: 120 },
      { task: "t2", day: 0, start: "20:00", minutes: 60 },
    ],
    plan([task("a", 300), task("b", 300)], { notBefore }),
  );
  expect(starts(placed)).toEqual(["b 5 15:00", "a 5 17:30"]);
});

test("a lighter day keeps to its minutes and gets no deep work", () => {
  const limits = [{ minutes: 60, deep: false }, null];
  const placed = check(
    [
      { task: "t1", day: 0, start: "15:00", minutes: 60 }, // deep on a sick day
      { task: "t2", day: 0, start: "16:30", minutes: 45 },
      { task: "t2", day: 0, start: "18:00", minutes: 30 }, // over the hour
      { task: "t1", day: 1, start: "10:00", minutes: 60 },
    ],
    plan([task("a"), task("b", 120, "light")], { limits }),
  );
  expect(starts(placed)).toEqual(["b 5 16:30", "a 6 10:00"]);
});

test("when only some work moves, each task places just what moved", () => {
  const allowance = new Map([["a", 60]]);
  const placed = check(
    [
      { task: "t1", day: 0, start: "16:00", minutes: 45 },
      { task: "t1", day: 0, start: "17:00", minutes: 30 }, // past the 60 that moved
      { task: "t2", day: 0, start: "19:00", minutes: 30 }, // didn't move at all
    ],
    plan([task("a"), task("b")], { allowance }),
  );
  expect(starts(placed)).toEqual(["a 5 16:00"]);
});

test("the student's preferences reach the planner, and nothing when unset", () => {
  const tasks = [task("essay")];
  expect(message(plan(tasks))).not.toContain("preferences");
  const text = message(
    plan(tasks, { preferences: preferenceRules({ sessions: "long" }) }),
  );
  expect(text).toContain("The student's preferences:\n- Big chunks");
});
