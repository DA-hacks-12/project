import { expect, test } from "vitest";
import { zoned } from "@/lib/time";
import { freeTime } from "./free-time";
import { checkPick } from "./rest";

const TZ = "America/Los_Angeles";
const AFTERNOON = zoned("2026-10-16T22:00:00Z", TZ); // 3pm
const HOURS = [...Array(8).fill(5), ...Array(16).fill(60)];

test("no break for vague answers or evening naps; lengths held to the research", () => {
  expect(checkPick({ kind: "none", minutes: 10 }, AFTERNOON)).toBeNull();
  expect(
    checkPick({ kind: "nap", minutes: 20 }, AFTERNOON.with({ hour: 19 })),
  ).toBeNull();
  expect(checkPick({ kind: "nap", minutes: 45 }, AFTERNOON)).toEqual({
    rest: "nap",
    minutes: 20,
  });
});

test("free time names a real place when one is near", () => {
  const session = {
    start: AFTERNOON.with({ minute: 45 }),
    end: AFTERNOON.with({ hour: 16, minute: 45 }),
  };
  const park = {
    name: "Memorial Park",
    kind: "park" as const,
    lat: 0,
    lon: 0,
    km: 0.6,
  };
  const trail = {
    name: "Stevens Creek Trail",
    kind: "trail" as const,
    lat: 0,
    lon: 0,
    km: 2.1,
  };
  const ideas = freeTime([session], HOURS, AFTERNOON, [park, trail]);
  expect(ideas.map((i) => i.words)).toEqual([
    "Walk to Memorial Park.",
    "Go to Stevens Creek Trail.",
  ]);
});

test("what's wrong becomes checked changes: days in the week, real times, short titles", async () => {
  const { checkChanges } = await import("./changes");
  const { weekFrom } = await import("@/modules/arrange/core/plan");
  const now = AFTERNOON; // Friday 3pm
  const days = weekFrom(now); // Friday, Saturday
  const changes = checkChanges(
    {
      lighter: [
        { day: 0, minutes: 60, deep: false },
        { day: 5, minutes: 60, deep: false }, // past Saturday
      ],
      busy: [
        { day: 1, start: "15:00", end: "21:00", title: "Brother's   wedding" },
        { day: 0, start: "09:00", end: "10:00", title: "Already over" },
        { day: 1, start: "22:00", end: "20:00", title: "Backwards" },
      ],
      rest: { kind: "nap", minutes: 45 },
    },
    days,
    now,
    now,
  );
  expect(changes.lighter).toEqual([{ day: 0, minutes: 60, deep: false }]);
  expect(
    changes.busy.map((b) => `${b.title} ${b.start.hour}-${b.end.hour}`),
  ).toEqual(["Brother's wedding 15-21"]);
  expect(changes.rest).toEqual({ rest: "nap", minutes: 20 });
});
