import type { Zoned } from "@/lib/time";

// Breaks from What's wrong: a fixed list, with lengths held to what the
// research supports. Code writes the words shown; the model only picks.

export type Rest = "nap" | "walk" | "eat" | "move";

export const LENGTH: Record<Rest, { min: number; max: number }> = {
  nap: { min: 10, max: 20 }, // longer naps leave you groggy
  walk: { min: 10, max: 30 },
  eat: { min: 15, max: 40 },
  move: { min: 5, max: 15 },
};

// A nap close to bedtime takes the edge off the sleep pressure that brings
// sleep on, so the night starts later: none within 7 hours of usual sleep.
export const NAP_BEFORE_SLEEP = 7 * 60; // minutes
const DEFAULT_ASLEEP = -60; // 11pm, when the body clock isn't known

/** When naps stop for someone usually asleep at `asleep` (minutes from midnight; negative is the evening before). */
export function lastNap(asleep = DEFAULT_ASLEEP): number {
  return (((asleep - NAP_BEFORE_SLEEP) % 1440) + 1440) % 1440;
}

export function restWords(rest: Rest, minutes: number): string {
  switch (rest) {
    case "nap":
      return `Nap for ${minutes} minutes. Set an alarm.`;
    case "walk":
      return `Walk outside for ${minutes} minutes.`;
    case "eat":
      return `Eat something. Take ${minutes} minutes.`;
    case "move":
      return `Get up and move for ${minutes} minutes.`;
  }
}

export interface Pick {
  kind: Rest | "none";
  minutes: number;
}

/**
 * The break to place at `start`, or null when the answer doesn't call for one.
 * `asleep` is when the student usually falls asleep (minutes from midnight).
 */
export function checkPick(
  pick: Pick | null,
  start: Zoned,
  asleep = DEFAULT_ASLEEP,
): { rest: Rest; minutes: number } | null {
  if (!pick || pick.kind === "none") return null;
  if (pick.kind === "nap") {
    const at = start.hour * 60 + start.minute;
    const beforeSleep = (((asleep - at) % 1440) + 1440) % 1440;
    if (beforeSleep <= NAP_BEFORE_SLEEP) return null;
  }
  const { min, max } = LENGTH[pick.kind];
  return {
    rest: pick.kind,
    minutes: Math.min(Math.max(Math.round(pick.minutes), min), max),
  };
}
