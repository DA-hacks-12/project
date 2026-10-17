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

export const LAST_NAP_HOUR = 18; // later naps cost night sleep

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

/** The break to place at `start`, or null when the answer doesn't call for one. */
export function checkPick(
  pick: Pick | null,
  start: Zoned,
): { rest: Rest; minutes: number } | null {
  if (!pick || pick.kind === "none") return null;
  if (pick.kind === "nap" && start.hour >= LAST_NAP_HOUR) return null;
  const { min, max } = LENGTH[pick.kind];
  return {
    rest: pick.kind,
    minutes: Math.min(Math.max(Math.round(pick.minutes), min), max),
  };
}
