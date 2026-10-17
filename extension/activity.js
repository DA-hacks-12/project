/**
 * Active hours: for each hour of the day, the share of days (0–100) with any
 * browser use in that hour. Visit times are in milliseconds; hours are local.
 */
export function activeHours(visitTimes, days) {
  const daysByHour = Array.from({ length: 24 }, () => new Set());
  for (const time of visitTimes) {
    const at = new Date(time);
    daysByHour[at.getHours()].add(at.toDateString());
  }
  return daysByHour.map((seen) => Math.round((100 * seen.size) / days));
}

const MINUTE = 60_000;
const SLEEP_AT_LEAST = 3 * 60; // minutes: a shorter gap is a break, not a night

/**
 * Nights: for each morning, the longest gap in browsing between 6pm the day
 * before and 2pm that day, when it's at least three hours and has a visit on
 * both sides. Its start stands in for falling asleep and its end for getting
 * up (the first visit comes a little after waking). Minutes are counted from
 * that morning's midnight, so 11:30pm the night before is -30.
 */
export function sleepTimes(visitTimes, days, now = Date.now()) {
  const sorted = [...visitTimes].sort((a, b) => a - b);
  const nights = [];
  for (let back = days - 1; back >= 0; back--) {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    midnight.setDate(midnight.getDate() - back);
    const from = midnight.getTime() - 6 * 60 * MINUTE;
    const to = midnight.getTime() + 14 * 60 * MINUTE;
    const inside = sorted.filter((t) => t >= from && t <= to);
    let best = null;
    for (let i = 1; i < inside.length; i++) {
      const gap = inside[i] - inside[i - 1];
      if (!best || gap > best.gap)
        best = { gap, start: inside[i - 1], end: inside[i] };
    }
    if (!best || best.gap < SLEEP_AT_LEAST * MINUTE) continue;
    const y = midnight.getFullYear();
    const m = String(midnight.getMonth() + 1).padStart(2, "0");
    const d = String(midnight.getDate()).padStart(2, "0");
    nights.push({
      date: `${y}-${m}-${d}`,
      asleep: Math.round((best.start - midnight.getTime()) / MINUTE),
      up: Math.round((best.end - midnight.getTime()) / MINUTE),
    });
  }
  return nights;
}
