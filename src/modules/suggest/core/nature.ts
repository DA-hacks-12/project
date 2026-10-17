import { getTimes } from "suncalc";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import {
  addMinutes,
  atClock,
  hhmm,
  minutesBetween,
  shortDate,
  type Zoned,
} from "@/lib/time";
import { AWAKE, type Window } from "@/modules/arrange/core/plan";
import { type Place, walkMinutes } from "./places";

// Nature suggestions: one outing a day to a real place near the student, on
// top of the plan. Sonnet picks the place, the start and how long to stay;
// code works out the free gaps and checks every pick: the walk there, the stay
// and the walk back fit inside one gap, after now, while awake, ending by
// sunset and by 20:30. Nature suggestions never block anything: other ones
// are left out of the gaps, and a day that changes gets a new one.

export const STAY = { min: 15, max: 90 }; // minutes at the place
export const LATEST = "20:30"; // no outing ends later, even before a late sunset
const MIN_GAP = 30; // shorter gaps can't hold a walk there and back

export interface NatureDay {
  day: number; // the plan's day number (0 = today)
  window: Window; // that day's open time: today from now, else the whole day
  busy: Window[]; // sessions, events and breaks; never nature suggestions
  work: number; // minutes of sessions that day
}

export interface NatureInput {
  now: Zoned;
  hours: number[]; // 24 values; an hour under AWAKE is asleep
  places: Place[];
  days: NatureDay[];
}

/** A checked nature suggestion. */
export interface Outing {
  day: number;
  start: Zoned;
  minutes: number; // walk there + stay + walk back
  stay: number;
  walk: number; // minutes one way
  place: Place;
}

export const Suggestions = z.object({
  suggestions: z.array(
    z.object({
      day: z.number().int(),
      place: z.number().int(),
      start: z.string(),
      stay: z.number().int(),
    }),
  ),
});
export type Proposal = z.infer<typeof Suggestions>["suggestions"][number];

export const NATURE_SYSTEM = `You add one outdoor outing a day to a college student's study plan: a visit to a real park, garden, reserve or trail near them. Time outside, in green space, restores the attention that studying uses up, so the outing is part of the plan, not a reward after it.

You get the student's places (each with its kind and the walking time one way) and the days that need an outing: how much work each day holds, until when it's light, and the free gaps between the student's sessions, classes and other plans.

An outing is the walk there, the time at the place, and the walk back. All of it must fit inside one free gap, and end before it gets dark.

For each day:
- Pick one place, a start time (HH:MM, 24-hour) and the minutes to stay there (15 to 90).
- On a heavy day, a closer place or a shorter stay; on a light day, a farther or bigger place (a trail or a reserve) and a longer stay.
- Prefer a gap that breaks up a long stretch of work, and daylight over dusk.
- Vary the places across the days.
- Leave the day out when no gap holds the walk there and back, a stay of at least 15 minutes, and daylight.

Return the suggestions with the day number, the place number, the start and the stay.`;

const ms = (at: Zoned) => at.epochMilliseconds;
const later = (a: Zoned, b: Zoned) => (ms(a) >= ms(b) ? a : b);
const earlier = (a: Zoned, b: Zoned) => (ms(a) <= ms(b) ? a : b);

/** Sunset on `day`'s date at `point`, in `day`'s time zone; null where the sun doesn't set. */
export function sunsetOn(
  day: Zoned,
  point: { lat: number; lon: number },
): Zoned | null {
  const noon = day.startOfDay().with({ hour: 12 });
  const { sunset } = getTimes(new Date(ms(noon)), point.lat, point.lon);
  const at = sunset?.getTime() ?? Number.NaN;
  if (!Number.isFinite(at)) return null;
  return Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(
    day.timeZoneId,
  );
}

/** When an outing to `place` on `day` must be over: sunset there, and 20:30 at the latest. */
export function endsBy(day: Zoned, place: { lat: number; lon: number }): Zoned {
  const latest = atClock(day, LATEST) ?? day.startOfDay().add({ days: 1 });
  const sunset = sunsetOn(day, place);
  return sunset ? earlier(sunset, latest) : latest;
}

/** The day's free gaps: after now, between its busy times, while awake, 30 minutes or more. */
export function freeGaps(
  day: NatureDay,
  hours: number[],
  now: Zoned,
): Window[] {
  const end = day.window.end;
  const busy = [...day.busy].sort((a, b) => ms(a.start) - ms(b.start));
  const gaps: Window[] = [];
  let at = later(day.window.start, now);
  for (const span of [...busy, { start: end, end }]) {
    const until = earlier(span.start, end);
    if (ms(until) > ms(at))
      gaps.push(...awakeRuns(hours, { start: at, end: until }));
    at = later(at, span.end);
  }
  return gaps.filter((g) => minutesBetween(g.start, g.end) >= MIN_GAP);
}

/** Split a stretch into the parts that fall in awake hours. */
function awakeRuns(hours: number[], window: Window): Window[] {
  const runs: Window[] = [];
  let at = window.start;
  while (ms(at) < ms(window.end)) {
    const hourEnd = at
      .round({ smallestUnit: "hour", roundingMode: "floor" })
      .add({ hours: 1 });
    const next = earlier(hourEnd, window.end);
    if (hours[at.hour] >= AWAKE) {
      const last = runs.at(-1);
      if (last && ms(last.end) === ms(at)) last.end = next;
      else runs.push({ start: at, end: next });
    }
    at = next;
  }
  return runs;
}

function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

/** What Sonnet sees: the places, then each day's work, daylight and free gaps. */
export function natureMessage(input: NatureInput): string {
  const { now, places } = input;
  const origin = places[0]?.from ?? places[0];
  const lines = [
    `Now: ${shortDate(now)}, ${hhmm(now)}.`,
    "",
    "Places (number · name · kind · walk one way):",
    ...places.map(
      (p, i) =>
        `${i} · ${p.name} · ${p.kind} · ${walkMinutes(p)} min walk (${p.walk?.km ?? p.km} km)`,
    ),
    "",
    "Days (number · date · work planned · light until · free gaps):",
  ];
  for (const day of input.days) {
    const gaps = freeGaps(day, input.hours, now);
    const light = origin ? hhmm(endsBy(day.window.start, origin)) : LATEST;
    lines.push(
      [
        `${day.day}`,
        shortDate(day.window.start),
        `${durationText(day.work)} of work`,
        `light until ${light}`,
        gaps.length
          ? `free ${gaps.map((g) => `${hhmm(g.start)}–${hhmm(g.end)}`).join(", ")}`
          : "no free gaps",
      ].join(" · "),
    );
  }
  return lines.join("\n");
}

/** Keeps the picks that hold, at most one a day. */
export function checkNature(
  proposals: Proposal[],
  input: NatureInput,
): Outing[] {
  const days = new Map(input.days.map((d) => [d.day, d]));
  const kept = new Map<number, Outing>();
  for (const p of proposals) {
    const day = days.get(p.day);
    const place = Number.isInteger(p.place) ? input.places[p.place] : undefined;
    if (!day || kept.has(p.day) || !place) continue;
    if (!Number.isInteger(p.stay) || p.stay < STAY.min || p.stay > STAY.max)
      continue;
    const start = atClock(day.window.start, p.start);
    if (!start) continue;
    const walk = walkMinutes(place);
    const minutes = walk * 2 + p.stay;
    const end = addMinutes(start, minutes);
    if (ms(start) < ms(input.now)) continue;
    if (ms(end) > ms(endsBy(day.window.start, place))) continue;
    const fits = freeGaps(day, input.hours, input.now).some(
      (g) => ms(start) >= ms(g.start) && ms(end) <= ms(g.end),
    );
    if (!fits) continue;
    kept.set(p.day, { day: p.day, start, minutes, stay: p.stay, walk, place });
  }
  return [...kept.values()].sort((a, b) => ms(a.start) - ms(b.start));
}
