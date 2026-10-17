import { atClock, type Zoned } from "@/lib/time";
import type { Window } from "@/modules/arrange/core/plan";
import { checkPick, type Rest } from "./rest";

// What's wrong, turned into changes to the plan. The model fills a fixed
// schema; `checkChanges` keeps what holds and drops the rest. Plain code.

export interface RawChanges {
  lighter: { day: number; minutes: number; deep: boolean }[];
  busy: { day: number; start: string; end: string; title: string }[];
  rest: { kind: Rest; minutes: number } | null;
}

export interface Changes {
  lighter: { day: number; minutes: number; deep: boolean }[];
  busy: { day: number; start: Zoned; end: Zoned; title: string }[];
  rest: { rest: Rest; minutes: number } | null;
}

const MAX_DAY_MINUTES = 720;
const MAX_TITLE = 60;

/**
 * `days` are the plan's days (today first); `restStart` is when a break would
 * begin. Busy times must still be ahead; a day appears once in `lighter`.
 */
export function checkChanges(
  raw: RawChanges,
  days: Window[],
  now: Zoned,
  restStart: Zoned,
): Changes {
  const lighter = new Map<
    number,
    { day: number; minutes: number; deep: boolean }
  >();
  for (const l of raw.lighter) {
    if (!days[l.day] || !Number.isInteger(l.minutes) || l.minutes < 0) continue;
    lighter.set(l.day, {
      day: l.day,
      minutes: Math.min(l.minutes, MAX_DAY_MINUTES),
      deep: l.deep,
    });
  }

  const busy: Changes["busy"] = [];
  for (const b of raw.busy) {
    const day = days[b.day];
    if (!day) continue;
    const date = day.end.subtract({ days: 1 });
    const start = atClock(date, b.start);
    const end = b.end.trim() === "24:00" ? day.end : atClock(date, b.end);
    if (!start || !end || end.epochMilliseconds <= start.epochMilliseconds)
      continue;
    if (end.epochMilliseconds <= now.epochMilliseconds) continue;
    const title =
      b.title.split(/\s+/).filter(Boolean).join(" ").slice(0, MAX_TITLE) ||
      "Busy";
    busy.push({ day: b.day, start, end, title });
  }

  const rest = checkPick(
    raw.rest ? { kind: raw.rest.kind, minutes: raw.rest.minutes } : null,
    restStart,
  );
  return { lighter: [...lighter.values()], busy, rest };
}
