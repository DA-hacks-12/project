// The body clock: when the student sleeps, what that makes them (early,
// middle or late type), and how alert they are through the day. Plain code.
//
// Sleep comes from the extension (the longest gap in browsing each night), or
// from the student saying they're a morning or night person, or a default of
// 8am to 11pm. Chronotype is the middle of sleep on free days (Saturday and
// Sunday mornings), as in the Munich Chronotype Questionnaire. Alertness
// through the day is the Three-Process Model of Alertness (Åkerstedt &
// Folkard): sleep pressure builds from waking (S), a 24-hour rhythm peaks in
// the afternoon and shifts with chronotype (C), and grogginess fades in the
// first hour after waking (W).

/** One night: minutes from that morning's midnight (11:30pm before is -30). */
export interface Night {
  date: string; // the morning, YYYY-MM-DD
  asleep: number;
  up: number;
}

export type Clock = "morning" | "night";
export type Chronotype = "early" | "middle" | "late";

export interface BodyClock {
  up: number; // minutes after midnight
  asleep: number; // minutes from midnight; negative is the evening before
  type: Chronotype;
  /** Alertness for each hour, midnight first: 0 asleep, else 10 to 100. */
  hours: number[];
  /** The most alert stretch: [first hour, hour after the last]. */
  sharpest: [number, number];
  source: "learned" | "set" | "default";
  nights: number; // how many nights it's learned from
}

export const LEARN_FROM = 5; // nights needed before the browser's guess is used
const DEFAULT = { asleep: -60, up: 8 * 60 }; // 11pm to 8am
const SET: Record<Clock, { asleep: number; up: number }> = {
  morning: { asleep: -2 * 60, up: 6 * 60 }, // 10pm to 6am
  night: { asleep: 2 * 60, up: 10 * 60 }, // 2am to 10am
};
// Mid-sleep on free days: before 3:30am early, after 5am late.
const EARLY_BEFORE = 3.5 * 60;
const LATE_AFTER = 5 * 60;

export function bodyClockOf(saved: {
  nights?: unknown;
  clock?: string | null;
}): BodyClock {
  const nights = nightsOf(saved.nights);
  const clock =
    saved.clock === "morning" || saved.clock === "night" ? saved.clock : null;
  let sleep: { asleep: number; up: number; mid: number };
  let source: BodyClock["source"];
  if (clock) {
    sleep = withMid(SET[clock]);
    source = "set";
  } else if (nights.length >= LEARN_FROM) {
    const free = nights.filter((n) => isFreeMorning(n.date));
    const midOf = free.length >= 2 ? free : nights;
    sleep = {
      asleep: median(nights.map((n) => n.asleep)),
      up: median(nights.map((n) => n.up)),
      mid: median(midOf.map((n) => (n.asleep + n.up) / 2)),
    };
    source = "learned";
  } else {
    sleep = withMid(DEFAULT);
    source = "default";
  }
  const type: Chronotype =
    sleep.mid < EARLY_BEFORE
      ? "early"
      : sleep.mid > LATE_AFTER
        ? "late"
        : "middle";
  const hours = alertness(sleep.asleep, sleep.up, sleep.mid);
  return {
    up: sleep.up,
    asleep: sleep.asleep,
    type,
    hours,
    sharpest: sharpestOf(hours),
    source,
    nights: nights.length,
  };
}

/** Only nights that make sense: asleep 6pm–6am, up 3am–2pm, at least 3 hours. */
export function nightsOf(saved: unknown): Night[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (n): n is Night =>
      typeof n === "object" &&
      n !== null &&
      typeof n.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(n.date) &&
      Number.isFinite(n.asleep) &&
      Number.isFinite(n.up) &&
      n.asleep >= -6 * 60 &&
      n.asleep <= 6 * 60 &&
      n.up >= 3 * 60 &&
      n.up <= 14 * 60 &&
      n.up - n.asleep >= 3 * 60,
  );
}

function withMid(s: { asleep: number; up: number }) {
  return { ...s, mid: (s.asleep + s.up) / 2 };
}

function isFreeMorning(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// The model's constants (Åkerstedt & Folkard, 1997).
const S_RESTED = 14.3; // alertness from sleep pressure on waking after a full night
const S_FLOOR = 2.4; // what it falls toward through a long day
const S_RATE = 0.0353; // per hour awake
const C_AMPLITUDE = 2.5;
const C_PEAK = 16.8; // the rhythm's peak hour for someone asleep 11pm to 7am
const C_REFERENCE_MID = 3 * 60; // that sleeper's mid-sleep, 3am
const W_DROP = -5.72; // grogginess right after waking
const W_RATE = 1.51; // per hour
const SHARP = 95; // on the 10–100 scale

/** Alertness per hour on the hour's middle, 0 while asleep, else scaled 10–100. */
function alertness(asleep: number, up: number, mid: number): number[] {
  const peak = C_PEAK + (mid - C_REFERENCE_MID) / 60;
  const raw = Array.from({ length: 24 }, (_, h) => {
    const at = h * 60 + 30;
    if (isAsleep(at, asleep, up)) return null;
    const awake = ((((at - up) % 1440) + 1440) % 1440) / 60;
    const s = S_FLOOR + (S_RESTED - S_FLOOR) * Math.exp(-S_RATE * awake);
    const c = C_AMPLITUDE * Math.cos((2 * Math.PI * (at / 60 - peak)) / 24);
    const w = W_DROP * Math.exp(-W_RATE * awake);
    return s + c + w;
  });
  const values = raw.filter((v): v is number => v !== null);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return raw.map((v) =>
    v === null ? 0 : Math.round(10 + (90 * (v - low)) / (high - low || 1)),
  );
}

function isAsleep(at: number, asleep: number, up: number): boolean {
  const from = (asleep + 1440) % 1440;
  const to = up % 1440;
  return from < to ? at >= from && at < to : at >= from || at < to;
}

/** The stretch of hours around the peak that stay within 5% of it. */
function sharpestOf(hours: number[]): [number, number] {
  const peak = hours.indexOf(Math.max(...hours));
  let first = peak;
  let last = peak;
  while (hours[(first + 23) % 24] >= SHARP && (first + 23) % 24 !== peak)
    first = (first + 23) % 24;
  while (hours[(last + 1) % 24] >= SHARP && (last + 1) % 24 !== first)
    last = (last + 1) % 24;
  return [first, (last + 1) % 24];
}

const TYPE_WORD: Record<Chronotype, string> = {
  early: "Early type",
  middle: "Middle type",
  late: "Late type",
};

/** "2pm–8pm": the sharpest stretch. */
export function sharpestText(clock: BodyClock): string {
  return `${hourText(clock.sharpest[0])}–${hourText(clock.sharpest[1])}`;
}

/** Whether hour `h` falls in the sharpest stretch (which may wrap past midnight). */
export function isSharp(clock: BodyClock, h: number): boolean {
  const [first, end] = clock.sharpest;
  return first < end ? h >= first && h < end : h >= first || h < end;
}

/** "Late type, sharpest 2pm–8pm". */
export function inShort(clock: BodyClock): string {
  return `${TYPE_WORD[clock.type]}, sharpest ${sharpestText(clock)}`;
}

/** "Up around 9:30am, asleep around 1:30am · Late type · Sharpest 11am–2pm". */
export function describe(clock: BodyClock): string {
  return [
    `Up around ${aroundClock(clock.up)}, asleep around ${aroundClock(clock.asleep)}`,
    TYPE_WORD[clock.type],
    `Sharpest ${hourText(clock.sharpest[0])}–${hourText(clock.sharpest[1])}`,
  ].join(" · ");
}

/** To the nearest quarter hour, as "9:30am". */
function aroundClock(minutes: number): string {
  const at = (((Math.round(minutes / 15) * 15) % 1440) + 1440) % 1440;
  const h = Math.floor(at / 60);
  const m = at % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

function hourText(h: number): string {
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}
