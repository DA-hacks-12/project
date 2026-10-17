import { Temporal } from "temporal-polyfill";
import { expect, test } from "vitest";
import { parseFeed, schoolOf } from "./feed";
import { mockFeed } from "./mock";

const TZ = "America/Los_Angeles";
const TODAY = Temporal.PlainDate.from("2026-10-18"); // a Sunday
const NOW = new Date("2026-10-18T19:00:00Z"); // noon in Los Angeles

test("a mock school parses like Canvas: past work and calendar events stay out", () => {
  const state = parseFeed(mockFeed("state", TODAY, TZ), TZ, NOW);
  expect(state).toHaveLength(15);
  expect(schoolOf(state)).toBe("mockstate.instructure.com");
  expect(state.map((a) => a.title)).not.toContain("Problem Set 3");
  expect(state.map((a) => a.title)).not.toContain("Office Hours");
  const quiz = state.find((a) => a.title === "Reading Quiz 5");
  expect(quiz?.due).toBe("2026-10-20T03:00:00.000Z"); // Monday, 8pm local
  const reply = state.find((a) => a.uid === "event-sub-assignment-201");
  expect(reply?.due).toBe("2026-10-19T06:59:00.000Z"); // tonight, 11:59pm
  const essay = state.find((a) => a.title === "Essay 2: Argument Analysis");
  expect(essay?.text).toContain("1,200-1,500 word essay");
  expect(essay?.course).toBe("ENGL 1A");
  expect(essay?.url).toBe(
    "https://mockstate.instructure.com/courses/5102/assignments/102",
  );
  expect(state.find((a) => a.uid === "event-assignment-105")?.text).toBe("");
});

test("two schools can share Canvas ids", () => {
  const college = parseFeed(mockFeed("college", TODAY, TZ), TZ, NOW);
  expect(schoolOf(college)).toBe("canvas.mockcollege.edu");
  expect(college.map((a) => a.uid)).toContain("event-assignment-101");
  expect(college).toHaveLength(4);
});

test("everything upcoming is due this calendar week, whatever day it is", () => {
  for (const day of ["2026-10-18", "2026-10-21", "2026-10-23"]) {
    const today = Temporal.PlainDate.from(day);
    const noon = new Date(
      today.toZonedDateTime({ timeZone: TZ, plainTime: "12:00" })
        .epochMilliseconds,
    );
    const saturday = today.add({ days: 6 - (today.dayOfWeek % 7) });
    for (const school of ["state", "college"] as const) {
      const all = parseFeed(mockFeed(school, today, TZ), TZ, noon);
      expect(all.length).toBeGreaterThan(0);
      for (const a of all) {
        const due = Temporal.Instant.from(a.due).toZonedDateTimeISO(TZ);
        expect(
          Temporal.PlainDate.compare(due.toPlainDate(), saturday),
        ).toBeLessThanOrEqual(0);
      }
    }
  }
});
