"use client";

import { useEffect, useRef } from "react";
import { minutesBetween, type Zoned } from "@/lib/time";
import { AWAKE } from "@/modules/arrange/core/plan";
import type { Item } from "@/modules/planner/core/items";
import { Block } from "./Block";
import styles from "./timeline.module.css";

// The day as a line through time, left to right. Each block sits where it
// happens; blocks that overlap take another lane.

const PX_PER_HOUR = 168;
const LANE = 76;
const MIN_WIDTH = 56;

export function Timeline({
  items,
  hours,
  now,
}: {
  items: Item[];
  hours: number[] | null;
  now: Zoned | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstAwake = hours
    ? hours.findIndex((share, h) => h >= 5 && share >= AWAKE)
    : -1;
  const earliest = items.length
    ? Math.min(...items.map((i) => i.start.hour))
    : 24;
  const startHour = Math.max(
    0,
    Math.min(firstAwake >= 0 ? firstAwake : 7, earliest),
  );
  const span = 24 - startHour;
  const x = (at: Zoned) =>
    ((at.hour - startHour) * 60 + at.minute) * (PX_PER_HOUR / 60);

  const lanes: number[] = [];
  const placed = items.map((item) => {
    let lane = lanes.findIndex((end) => end <= item.start.epochMilliseconds);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = item.end.epochMilliseconds;
    return { item, lane };
  });

  const nowX = now ? x(now) : null;
  const firstX = items.length ? x(items[0].start) : 0;
  useEffect(() => {
    const target = nowX ?? firstX;
    scroller.current?.scrollTo({ left: Math.max(0, target - PX_PER_HOUR) });
  }, [nowX, firstX]);

  return (
    <div className={styles.scroll} ref={scroller}>
      <div
        className={styles.track}
        style={{
          width: span * PX_PER_HOUR,
          height: Math.max(1, lanes.length) * LANE + 36,
        }}
      >
        {Array.from({ length: span }, (_, i) => {
          const hour = startHour + i;
          return (
            <div
              key={hour}
              className={styles.tick}
              style={{ left: i * PX_PER_HOUR }}
            >
              <span>
                {hour % 12 || 12}
                {hour < 12 ? "am" : "pm"}
              </span>
            </div>
          );
        })}
        {nowX !== null && nowX >= 0 && (
          <div className={styles.now} style={{ left: nowX }} />
        )}
        {placed.map(({ item, lane }) => (
          <div
            key={item.key}
            className={styles.slot}
            style={{
              left: x(item.start),
              width: Math.max(
                MIN_WIDTH,
                (minutesBetween(item.start, item.end) / 60) * PX_PER_HOUR - 4,
              ),
              top: 32 + lane * LANE,
            }}
          >
            <Block item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}
