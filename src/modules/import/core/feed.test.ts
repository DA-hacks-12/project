import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseFeed } from "./feed";
import { check } from "./reading";

const ICS = readFileSync(
  new URL("./fixtures/canvas.ics", import.meta.url),
  "utf8",
);
const NOW = new Date("2026-10-16T19:00:00Z");
const byUid = () =>
  new Map(parseFeed(ICS, "America/Los_Angeles", NOW).map((a) => [a.uid, a]));

test("keeps upcoming assignments only, soonest first", () => {
  expect(parseFeed(ICS, "America/Los_Angeles", NOW).map((a) => a.uid)).toEqual([
    "event-sub-assignment-9",
    "event-assignment-101",
    "event-assignment-102",
    "event-assignment-override-77",
  ]);
});

test("an all-day assignment is due at 11:59pm local", () => {
  expect(byUid().get("event-assignment-101")?.due).toBe(
    "2026-10-21T06:59:00.000Z",
  );
});

test("splits the course code from the title and links the assignment", () => {
  const essay = byUid().get("event-assignment-101");
  expect(essay?.title).toBe("✏️ Essay #2");
  expect(essay?.course).toBe("F26 ENGL C1000 47Y Academic Reading And Writing");
  expect(essay?.url).toBe(
    "https://school.instructure.com/courses/48180/assignments/101",
  );
});

test("the model's reading keeps only what holds", () => {
  const found = check({
    deliverable: "  1,200-word   essay ",
    requirements: ["MLA", "", "MLA", "a", "b", "c", "d", "e"],
    minutes: 5000,
    work: "deep",
  });
  expect(found).toEqual({
    deliverable: "1,200-word essay",
    requirements: ["MLA", "a", "b", "c", "d"],
    minutes: null,
    work: "deep",
  });
});
