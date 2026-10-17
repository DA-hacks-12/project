import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import {
  check,
  checkAndFill,
  message,
  type OpenTask,
  type Plan,
  weekFrom,
} from "./plan";
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

test("a plan covers this school week and the next: today through next Saturday", () => {
  expect(weekFrom(NOW)).toHaveLength(9); // Friday, Saturday, then next week
  expect(weekFrom(zoned("2026-10-18T19:00:00Z", TZ))).toHaveLength(14); // Sunday
  expect(weekFrom(zoned("2026-10-17T19:00:00Z", TZ))).toHaveLength(8); // Saturday
  expect(weekFrom(NOW)[8].end.toPlainDate().toString()).toBe("2026-10-25");
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

test("drops the past, overlaps, asleep hours, unknown tasks, bad times and days past next Saturday", () => {
  const placed = check(
    [
      { task: "t1", day: 0, start: "13:00", minutes: 30 },
      { task: "t1", day: 0, start: "15:00", minutes: 60 },
      { task: "t2", day: 0, start: "15:30", minutes: 30 },
      { task: "t2", day: 1, start: "06:00", minutes: 30 },
      { task: "t9", day: 1, start: "10:00", minutes: 30 },
      { task: "t2", day: 1, start: "25:00", minutes: 30 },
      { task: "t2", day: 9, start: "10:00", minutes: 30 }, // past next Saturday
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
      { task: "t2", day: 0, start: "15:00", minutes: 90 },
      { task: "t1", day: 0, start: "17:00", minutes: 90 },
      { task: "t2", day: 0, start: "19:00", minutes: 90 }, // 4.5 hours of deep work
    ],
    plan([task("a", 300), task("b", 300)], { notBefore }),
  );
  expect(starts(placed)).toEqual(["b 5 15:00", "a 5 17:00"]);
});

test("pacing: after 90 minutes of work in a row, a 30-minute break", () => {
  const placed = check(
    [
      { task: "t1", day: 0, start: "15:00", minutes: 45 },
      { task: "t2", day: 0, start: "15:55", minutes: 45 }, // 90 in a row
      { task: "t1", day: 0, start: "16:50", minutes: 30 }, // 10 minutes later: no
      { task: "t1", day: 0, start: "17:10", minutes: 30 }, // 30 minutes later: yes
    ],
    plan([task("a", 300), task("b", 300, "light")]),
  );
  expect(starts(placed)).toEqual(["a 5 15:00", "b 5 15:55", "a 5 17:10"]);
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

test("code fills what the model left, and moves deep work to the sharper hour", () => {
  // Saturday: sharp from 3pm (90), dull in the morning (40).
  const hours = [
    ...Array(8).fill(0),
    ...Array(7).fill(40),
    ...Array(6).fill(90),
    ...Array(3).fill(40),
  ];
  const essay = task("essay", 60, "deep");
  const quiz = task("quiz", 60, "light");
  const { placed, filled } = checkAndFill(
    [
      { task: "t1", day: 1, start: "10:00", minutes: 60 }, // deep in the morning
      { task: "t2", day: 1, start: "16:00", minutes: 60 }, // light at the peak
    ],
    plan([essay, quiz], { hours }),
  );
  expect(filled).toBe(0);
  const at = (id: string) => placed.find((s) => s.task === id)?.start.hour;
  expect(at("essay")).toBe(16);
  expect(at("quiz")).toBe(10);

  // The model placed nothing: code places both, deep work at the peak.
  const fromNothing = checkAndFill([], plan([essay, quiz], { hours }));
  expect(fromNothing.filled).toBe(2);
  const essayHour = fromNothing.placed.find((s) => s.task === "essay")?.start
    .hour;
  expect(essayHour).toBeGreaterThanOrEqual(15);
  expect(essayHour).toBeLessThan(21);
});
