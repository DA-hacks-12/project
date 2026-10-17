import { expect, describe as group, it } from "vitest";
import { sleepTimes } from "../../../../extension/activity.js";
import { bodyClockOf, describe, nightsOf } from "./body-clock";

// Ten nights asleep around 1:45am, up around 9:45am (October 2026: the 10th
// and 11th, 17th and 18th are weekend mornings).
const LATE = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-10-${String(6 + i).padStart(2, "0")}`,
  asleep: 90 + (i % 3) * 15,
  up: 570 + (i % 2) * 30,
}));

group("bodyClockOf", () => {
  it("learns a late type from the browser's nights", () => {
    const clock = bodyClockOf({ nights: LATE });
    expect(clock.source).toBe("learned");
    expect(clock.type).toBe("late");
    expect(describe(clock)).toBe(
      "Up around 9:45am, asleep around 1:45am · Late type · Sharpest 4pm–8pm",
    );
  });

  it("is asleep (0) between sleep and waking, awake 10–100 otherwise", () => {
    const { hours } = bodyClockOf({ nights: LATE });
    expect(hours.slice(2, 10)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    for (const h of [10, 14, 20, 23]) {
      expect(hours[h]).toBeGreaterThanOrEqual(10);
      expect(hours[h]).toBeLessThanOrEqual(100);
    }
  });

  it("what the student says wins over what was learned", () => {
    expect(bodyClockOf({ nights: LATE, clock: "morning" })).toMatchObject({
      source: "set",
      type: "early",
    });
    expect(bodyClockOf({ clock: "night" }).type).toBe("late");
  });

  it("without enough nights, a default of 8am to 11pm", () => {
    const clock = bodyClockOf({ nights: LATE.slice(0, 4) });
    expect(clock.source).toBe("default");
    expect(clock.hours.slice(8, 23).every((h) => h >= 10)).toBe(true);
    expect([...clock.hours.slice(0, 8), clock.hours[23]]).toEqual(
      Array(9).fill(0),
    );
  });

  it("drops nights that don't make sense", () => {
    expect(
      nightsOf([
        { date: "2026-10-10", asleep: 60, up: 540 },
        { date: "2026-10-11", asleep: 60, up: 120 }, // under 3 hours
        { date: "2026-10-12", asleep: -900, up: 540 }, // asleep at 9am the day before
        { date: "soon", asleep: 60, up: 540 },
        "nope",
      ]),
    ).toEqual([{ date: "2026-10-10", asleep: 60, up: 540 }]);
  });
});

group("sleepTimes (in the extension)", () => {
  it("takes each night's longest gap in browsing", () => {
    const at = (day: number, h: number, m = 0) =>
      new Date(2026, 9, day, h, m).getTime();
    const visits = [
      at(15, 20),
      at(15, 23, 40), // last visit before sleep
      at(16, 8, 50), // first visit after waking
      at(16, 12),
      at(16, 22),
      at(17, 1, 10),
      at(17, 9, 30),
    ];
    const nights = sleepTimes(visits, 2, at(17, 15));
    expect(nights).toEqual([
      { date: "2026-10-16", asleep: -20, up: 530 },
      { date: "2026-10-17", asleep: 70, up: 570 },
    ]);
  });
});
