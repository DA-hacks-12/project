import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import { ADVICE_MAX, adviceMessage, checkAdvice } from "./advice";

test("advice is one trimmed line of at most 140 characters, or nothing", () => {
  expect(checkAdvice("  Eat something real before the next session.  ")).toBe(
    "Eat something real before the next session.",
  );
  expect(checkAdvice("")).toBeNull();
  expect(checkAdvice("   ")).toBeNull();
  expect(checkAdvice("First line.\nSecond line.")).toBeNull();
  expect(checkAdvice("x".repeat(ADVICE_MAX))).toHaveLength(ADVICE_MAX);
  expect(checkAdvice("x".repeat(ADVICE_MAX + 1))).toBeNull();
  expect(checkAdvice(null)).toBeNull();
  expect(checkAdvice(42)).toBeNull();
});

test("a line well past the 18 words asked for is dropped", () => {
  expect(checkAdvice(Array(24).fill("go").join(" "))).not.toBeNull();
  expect(checkAdvice(Array(25).fill("go").join(" "))).toBeNull();
});

test("the model sees the hour and what's left of the day, then the student's words last", () => {
  const now = zoned("2026-10-16T08:00:00Z", "America/Los_Angeles"); // Friday 1am
  const text = adviceMessage({
    answer: " head hurts ",
    now,
    alertness: 0,
    lastNap: "16:00",
    clock:
      "Up around 8am, asleep around 11pm · Middle type · Sharpest 11am–3pm",
    workedToday: 0,
    rest: [
      {
        start: now.add({ hours: 8 }),
        end: now.add({ hours: 9 }),
        what: "Lab Report 2",
      },
    ],
    session: null,
  });
  expect(text).toMatch(
    /^It's Friday, 01:00\. Estimated alertness this hour: 0 \(0 asleep, 100 sharpest\)\. Nap cutoff: 16:00\./,
  );
  expect(text).toContain("Body clock: Up around 8am, asleep around 11pm");
  expect(text).toContain("Still today: 09:00–10:00 Lab Report 2.");
  expect(text.endsWith("<answer>\nhead hurts\n</answer>")).toBe(true);
});
