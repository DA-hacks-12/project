import { Temporal } from "temporal-polyfill";
import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import { type Item, mayMove, replanSpan } from "./items";

const TZ = "America/Los_Angeles";
const NOW = zoned("2026-10-16T19:00:00Z", TZ); // Friday noon
const PLAN_END = zoned("2026-10-25T07:00:00Z", TZ); // end of next Saturday
const FRIDAY = Temporal.PlainDate.from("2026-10-16");
const WEDNESDAY = Temporal.PlainDate.from("2026-10-21");

const span = (
  r: Parameters<typeof replanSpan>[0],
  date: Temporal.PlainDate,
) => {
  const s = replanSpan(r, date, NOW, PLAN_END);
  return s && `${s.from.toPlainDateTime()}–${s.to.toPlainDateTime()}`;
};
const session = (start: string, minutes: number) =>
  ({
    kind: "session",
    key: start,
    start: zoned(start, TZ),
    end: zoned(start, TZ).add({ minutes }),
    block: { id: start, done: false },
  }) as unknown as Item;

test("Day shows the day chosen, Week every day left", () => {
  expect(span({ scope: "day" }, FRIDAY)).toBe(
    "2026-10-16T12:00:00–2026-10-17T00:00:00",
  );
  expect(span({ scope: "day", day: "2026-10-21" }, FRIDAY)).toBeNull();
  expect(span({ scope: "day", day: "2026-10-21" }, WEDNESDAY)).toBe(
    "2026-10-21T00:00:00–2026-10-22T00:00:00",
  );
  expect(span({ scope: "week" }, WEDNESDAY)).not.toBeNull();
  expect(span({ scope: "week" }, FRIDAY.add({ days: 9 }))).toBeNull(); // past the plan
});

test("Day on another day moves that day's sessions only", () => {
  const today = session("2026-10-16T21:00:00Z", 60); // Friday 2pm
  const wednesday = session("2026-10-21T21:00:00Z", 60);
  const wednesdayDay = { scope: "day", day: "2026-10-21" } as const;
  expect(mayMove(today, wednesdayDay, NOW)).toBe(false);
  expect(mayMove(wednesday, wednesdayDay, NOW)).toBe(true);
  expect(mayMove(today, { scope: "day" }, NOW)).toBe(true);
  expect(mayMove(wednesday, { scope: "day" }, NOW)).toBe(false);
});
