"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { minutesBetween, type Zoned } from "@/lib/time";
import { AWAKE } from "@/modules/arrange/core/plan";
import type { Item } from "@/modules/planner/core/items";
import { Block } from "./Block";
import styles from "./timeline.module.css";

// The day as a line through time, left to right. Hour lines and the now line
// run the full height; the blocks sit in a band across the middle, each where
// it happens. Blocks that overlap take another lane.

const PX_PER_HOUR = 168;
const MIN_WIDTH = 40;
/** Narrower than this, a block shows when it starts instead of its range. */
const NARROW = 90;

export function Timeline({
  items,
  hours,
  now,
  sharp = [],
  replan = null,
  moving,
}: {
  items: Item[];
  hours: number[] | null;
  now: Zoned | null;
  /** The student's sharpest hours, as runs within the day ([[14, 20]]). */
  sharp?: [number, number][];
  /** The part of the day being replanned right now: a wave crosses it. */
  replan?: { from: Zoned; to: Zoned } | null;
  /** The blocks that may move in it (their keys): they breathe. */
  moving?: Set<string>;
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
    const width = Math.max(
      MIN_WIDTH,
      (minutesBetween(item.start, item.end) / 60) * PX_PER_HOUR - 4,
    );
    const past =
      now !== null && item.end.epochMilliseconds <= now.epochMilliseconds;
    return { item, lane, width, past };
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
        style={
          {
            width: span * PX_PER_HOUR,
            "--lanes": Math.max(1, lanes.length),
          } as CSSProperties
        }
      >
        {Array.from({ length: span }, (_, i) => {
          const hour = startHour + i;
          return (
            <div
              key={hour}
              className={styles.tick}
              style={{ left: i * PX_PER_HOUR }}
            />
          );
        })}
        {sharp.map(([first, end]) => {
          const from = Math.max(first, startHour);
          if (end <= from) return null;
          return (
            <div
              key={first}
              className={styles.sharp}
              style={{
                left: (from - startHour) * PX_PER_HOUR,
                width: (end - from) * PX_PER_HOUR,
              }}
            >
              <span>Sharpest</span>
            </div>
          );
        })}
        {replan &&
          waveCells(replan, startHour).map((cell, i) => (
            <div
              key={cell.left}
              className={`${styles.cell} replan-cell`}
              style={{
                left: cell.left,
                width: cell.width,
                animationDelay: `calc(var(--replan-step) * ${i})`,
              }}
            />
          ))}
        {nowX !== null && nowX >= 0 && (
          <div className={styles.now} style={{ left: nowX }} />
        )}
        <div className={styles.band}>
          {Array.from({ length: span }, (_, i) => {
            const hour = startHour + i;
            return (
              <span
                key={hour}
                className={styles.hour}
                style={{ left: i * PX_PER_HOUR }}
              >
                {hour % 12 || 12}
                {hour < 12 ? "am" : "pm"}
              </span>
            );
          })}
          {placed.map(({ item, lane, width, past }) => (
            <div
              key={item.key}
              className={`${styles.slot} ${past ? styles.past : ""}`}
              style={
                { left: x(item.start), width, "--lane": lane } as CSSProperties
              }
            >
              <Block
                item={item}
                narrow={width < NARROW}
                moving={moving?.has(item.key)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The replanned stretch cut into hour columns, in pixels along the track. */
function waveCells(
  replan: { from: Zoned; to: Zoned },
  startHour: number,
): { left: number; width: number }[] {
  const minute = (at: Zoned, sameDay: boolean) =>
    sameDay ? at.hour * 60 + at.minute : 24 * 60;
  const from = Math.max(minute(replan.from, true), startHour * 60);
  const to = minute(
    replan.to,
    replan.to.toPlainDate().equals(replan.from.toPlainDate()),
  );
  const cells: { left: number; width: number }[] = [];
  for (let at = from; at < to; at = (Math.floor(at / 60) + 1) * 60) {
    const end = Math.min(to, (Math.floor(at / 60) + 1) * 60);
    cells.push({
      left: ((at - startHour * 60) / 60) * PX_PER_HOUR,
      width: ((end - at) / 60) * PX_PER_HOUR,
    });
  }
  return cells;
}
