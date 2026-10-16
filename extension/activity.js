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
