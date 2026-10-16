import { minutesBetween, type Zoned } from "@/lib/time";
import { AWAKE, type Window } from "@/modules/arrange/core/plan";
import type { Place } from "./places";

// Free time: plain code puts an outdoor idea on the longest open gaps of a
// day, sized to the gap and the hour, naming a real place when one is near.
// Worked out on display, never saved.

const GAP = 30; // minutes
const PER_DAY = 3;
const NEAR_KM = 1.5;

export interface Idea {
  start: Zoned;
  minutes: number;
  words: string;
  place: Place | null;
}

export function freeTime(
  busy: Window[],
  hours: number[],
  from: Zoned,
  places: Place[],
): Idea[] {
  const end = from.startOfDay().add({ days: 1 });
  const sorted = [...busy].sort(
    (a, b) => a.start.epochMilliseconds - b.start.epochMilliseconds,
  );
  const gaps: Window[] = [];
  let at = from;
  for (const span of [...sorted, { start: end, end }]) {
    if (span.start.epochMilliseconds > at.epochMilliseconds) {
      const until =
        span.start.epochMilliseconds < end.epochMilliseconds ? span.start : end;
      gaps.push(...awakeRuns(hours, { start: at, end: until }));
    }
    if (span.end.epochMilliseconds > at.epochMilliseconds) at = span.end;
  }

  const ideas: Idea[] = [];
  const longest = gaps
    .filter((g) => minutesBetween(g.start, g.end) >= GAP)
    .sort(
      (a, b) => minutesBetween(b.start, b.end) - minutesBetween(a.start, a.end),
    );
  for (const gap of longest) {
    const idea = ideaFor(gap.start, minutesBetween(gap.start, gap.end), places);
    if (ideas.length < PER_DAY && !ideas.some((i) => i.words === idea.words))
      ideas.push(idea);
  }
  return ideas.sort(
    (a, b) => a.start.epochMilliseconds - b.start.epochMilliseconds,
  );
}

function ideaFor(start: Zoned, gap: number, places: Place[]): Idea {
  const near =
    places.find((p) => p.km <= NEAR_KM && p.kind !== "trail") ?? null;
  const fit = (minutes: number) => Math.min(minutes, gap);
  if (start.hour < 12) {
    return {
      start,
      minutes: fit(15),
      words: "Get morning light outside.",
      place: null,
    };
  }
  if (start.hour < 14) {
    const words = near ? `Eat lunch at ${near.name}.` : "Eat lunch outside.";
    return { start, minutes: fit(30), words, place: near };
  }
  if (start.hour < 18 && gap >= 60) {
    const far =
      places.find((p) => p.kind === "trail" || p.kind === "reserve") ??
      places.find((p) => /park/i.test(p.name) && p.km >= 0.5) ??
      places[0] ??
      null;
    const words = far ? `Go to ${far.name}.` : "Go to a park or a trail.";
    return { start, minutes: fit(45), words, place: far };
  }
  if (start.hour < 18) {
    const words = near ? `Walk to ${near.name}.` : "Take a walk outside.";
    return { start, minutes: fit(20), words, place: near };
  }
  return {
    start,
    minutes: fit(10),
    words: "Step outside and look at the sky.",
    place: null,
  };
}

/** Split a gap into the stretches that fall in awake hours. */
function awakeRuns(hours: number[], window: Window): Window[] {
  const runs: Window[] = [];
  let at = window.start;
  while (at.epochMilliseconds < window.end.epochMilliseconds) {
    const hourEnd = at
      .round({ smallestUnit: "hour", roundingMode: "floor" })
      .add({ hours: 1 });
    const next =
      hourEnd.epochMilliseconds < window.end.epochMilliseconds
        ? hourEnd
        : window.end;
    if (hours[at.hour] >= AWAKE) {
      const last = runs.at(-1);
      if (last && last.end.epochMilliseconds === at.epochMilliseconds)
        last.end = next;
      else runs.push({ start: at, end: next });
    }
    at = next;
  }
  return runs;
}
