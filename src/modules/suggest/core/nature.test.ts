import { expect, test } from "vitest";
import { hhmm, nextStep, zoned } from "@/lib/time";
import {
  checkNature,
  endsBy,
  freeGaps,
  type NatureDay,
  type NatureInput,
  natureMessage,
  type Proposal,
  sunsetOn,
} from "./nature";
import type { Place } from "./places";

const TZ = "America/Los_Angeles";
const at = (text: string) => zoned(`${text}:00-07:00`, TZ);
const NOW = at("2026-10-16T14:10"); // a Friday
const HOME = { lat: 37.3861, lon: -122.0838 };

// Awake 8am to 11pm.
const HOURS = Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 23 ? 50 : 0));

const PLACES: Place[] = [
  {
    name: "Pioneer Park",
    kind: "park",
    lat: 37.39,
    lon: -122.08,
    km: 0.5,
    from: HOME,
    walk: { minutes: 10, km: 0.8, estimate: false },
  },
  {
    name: "Stevens Creek Trail",
    kind: "trail",
    lat: 37.41,
    lon: -122.06,
    km: 3.2,
    from: HOME,
    walk: { minutes: 40, km: 3.6, estimate: false },
  },
  // Saved before walks: no walk, no origin.
  { name: "Old Garden", kind: "garden", lat: 37.38, lon: -122.09, km: 1 },
];

const FRIDAY: NatureDay = {
  day: 0,
  window: { start: nextStep(NOW), end: at("2026-10-17T00:00") },
  busy: [
    { start: at("2026-10-16T15:00"), end: at("2026-10-16T16:00") }, // a session
    { start: at("2026-10-16T18:00"), end: at("2026-10-16T20:00") }, // a shift
  ],
  work: 60,
};
const SATURDAY: NatureDay = {
  day: 1,
  window: { start: at("2026-10-17T00:00"), end: at("2026-10-18T00:00") },
  busy: [{ start: at("2026-10-17T10:00"), end: at("2026-10-17T12:00") }],
  work: 120,
};

const input = (extra: Partial<NatureInput> = {}): NatureInput => ({
  now: NOW,
  hours: HOURS,
  places: PLACES,
  days: [FRIDAY, SATURDAY],
  ...extra,
});

const pick = (
  day: number,
  place: number,
  start: string,
  stay: number,
): Proposal => ({ day, place, start, stay });

test("free gaps start after now, skip busy times and sleep, and are 30+ minutes", () => {
  const gaps = (day: NatureDay) =>
    freeGaps(day, HOURS, NOW).map((g) => `${hhmm(g.start)}–${hhmm(g.end)}`);
  expect(gaps(FRIDAY)).toEqual(["14:15–15:00", "16:00–18:00", "20:00–23:00"]);
  expect(gaps(SATURDAY)).toEqual(["08:00–10:00", "12:00–23:00"]);
});

test("keeps a pick whose walk there, stay and walk back fit one gap before dark", () => {
  const [outing] = checkNature([pick(0, 0, "16:10", 30)], input());
  expect(outing.day).toBe(0);
  expect(hhmm(outing.start)).toBe("16:10");
  expect(outing).toMatchObject({ minutes: 50, stay: 30, walk: 10 });
  expect(outing.place.name).toBe("Pioneer Park");
});

test("drops a pick whose walk doesn't fit its gap, or that runs into a busy time", () => {
  expect(checkNature([pick(0, 1, "14:15", 15)], input())).toEqual([]); // 95 min in a 45 min gap
  expect(checkNature([pick(0, 0, "14:50", 15)], input())).toEqual([]); // into the 3pm session
});

test("drops a pick in the past or while asleep", () => {
  expect(checkNature([pick(0, 0, "13:00", 20)], input())).toEqual([]);
  expect(checkNature([pick(1, 0, "07:00", 20)], input())).toEqual([]);
});

test("an outing ends by sunset", () => {
  const sunset = sunsetOn(SATURDAY.window.start, PLACES[0]);
  expect(sunset && hhmm(sunset)).toMatch(/^18:[23]\d$/); // mid-October, Bay Area
  expect(checkNature([pick(1, 0, "17:30", 30)], input())).toHaveLength(1); // home by 18:20
  expect(checkNature([pick(1, 0, "18:30", 15)], input())).toEqual([]); // after dark
});

test("an outing ends by 20:30 even when the sun sets later", () => {
  const june = zoned("2026-06-20T12:00:00-07:00", "America/Los_Angeles");
  const seattle = { lat: 47.6, lon: -122.33 };
  expect(hhmm(sunsetOn(june, seattle) ?? june)).toMatch(/^21:/);
  expect(hhmm(endsBy(june, seattle))).toBe("20:30");
});

test("drops bad stays, places, days and times, and keeps one a day", () => {
  const bad = [
    pick(0, 0, "16:10", 10), // too short
    pick(0, 0, "16:10", 95), // too long
    pick(0, 5, "16:10", 30), // no such place
    pick(0, -1, "16:10", 30),
    pick(3, 0, "16:10", 30), // not a day asked for
    pick(0, 0, "25:00", 30), // no such time
    pick(0, 0, "4pm", 30),
  ];
  expect(checkNature(bad, input())).toEqual([]);
  const twice = checkNature(
    [pick(0, 0, "16:10", 30), pick(0, 0, "20:00", 15), pick(1, 1, "13:00", 60)],
    input(),
  );
  expect(twice.map((o) => [o.day, hhmm(o.start)])).toEqual([
    [0, "16:10"],
    [1, "13:00"],
  ]);
  expect(twice[1].minutes).toBe(140); // 40 there, 60 there, 40 back
});

test("a place saved before walks uses an estimate from its distance", () => {
  const [outing] = checkNature([pick(1, 2, "13:00", 20)], input());
  expect(outing.walk).toBe(16); // 1 km × 1.3 at 5 km/h
  expect(outing.minutes).toBe(52);
});

test("Sonnet sees each place's walk and each day's work, daylight and gaps", () => {
  const text = natureMessage(input());
  expect(text).toContain("0 · Pioneer Park · park · 10 min walk (0.8 km)");
  expect(text).toContain("2 · Old Garden · garden · 16 min walk (1 km)");
  expect(text).toMatch(
    /0 · Fri Oct 16 · 1h of work · light until 18:\d\d · free 14:15–15:00, 16:00–18:00, 20:00–23:00/,
  );
});
