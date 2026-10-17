import { Temporal } from "temporal-polyfill";
import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import { type ClassRule, classesOn, classTimes, daysText } from "./classes";
import { checkClasses } from "./reading";

const TZ = "America/Los_Angeles";
const rule = (over: Partial<ClassRule> = {}): ClassRule => ({
  id: "phys",
  title: "PHYS 2A Lecture",
  days: [1, 3],
  start: "09:30",
  minutes: 75,
  place: "SC 112",
  starts_on: null,
  ends_on: null,
  ...over,
});

test("a class meets on its weekdays at its local time", () => {
  const monday = Temporal.PlainDate.from("2026-10-19");
  const [lecture] = classesOn([rule()], monday, TZ);
  expect(lecture.start.toString()).toBe(
    "2026-10-19T09:30:00-07:00[America/Los_Angeles]",
  );
  expect(lecture.end.toPlainTime().toString()).toBe("10:45:00");
  expect(classesOn([rule()], monday.add({ days: 1 }), TZ)).toEqual([]);
});

test("a class keeps to its term when the schedule shows one", () => {
  const term = rule({ starts_on: "2026-09-21", ends_on: "2026-12-11" });
  expect(classesOn([term], Temporal.PlainDate.from("2026-12-14"), TZ)).toEqual(
    [],
  );
  expect(
    classesOn([term], Temporal.PlainDate.from("2026-12-09"), TZ),
  ).toHaveLength(1);
});

test("a week holds every meeting in it", () => {
  const from = zoned("2026-10-18T07:00:00Z", TZ); // Sunday midnight
  const times = classTimes(
    [rule(), rule({ id: "engl", days: [2, 4], start: "11:00" })],
    from,
    from.add({ days: 7 }),
  );
  expect(times.map((t) => t.start.toPlainDate().dayOfWeek)).toEqual([
    1, 2, 3, 4,
  ]);
});

test("only meetings that hold are kept, as they'll be saved", () => {
  const kept = checkClasses([
    {
      title: " PHYS 2A  Lecture ",
      days: [3, 1, 1],
      start: "9:30",
      end: "10:45",
      place: "SC 112",
      from: "2026-09-21",
      until: "2026-12-11",
    },
    {
      title: "Online",
      days: [],
      start: "09:00",
      end: "10:00",
      place: null,
      from: null,
      until: null,
    },
    {
      title: "Backwards",
      days: [2],
      start: "14:00",
      end: "13:00",
      place: null,
      from: null,
      until: null,
    },
    {
      title: "Bad clock",
      days: [2],
      start: "25:00",
      end: "26:00",
      place: null,
      from: null,
      until: null,
    },
    {
      title: "Bad term",
      days: [5],
      start: "08:00",
      end: "08:50",
      place: null,
      from: "2026-12-11",
      until: "2026-09-21",
    },
  ]);
  expect(kept).toEqual([
    {
      title: "PHYS 2A Lecture",
      days: [1, 3],
      start: "09:30",
      minutes: 75,
      place: "SC 112",
      starts_on: "2026-09-21",
      ends_on: "2026-12-11",
    },
    {
      title: "Bad term",
      days: [5],
      start: "08:00",
      minutes: 50,
      place: null,
      starts_on: null,
      ends_on: null,
    },
  ]);
  expect(daysText([4, 2, 0])).toBe("Tue Thu Sun");
});
