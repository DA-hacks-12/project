"use client";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import type { EventInput } from "@fullcalendar/react";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Button, Flex, Heading, IconButton } from "@radix-ui/themes";
import dynamic from "next/dynamic";
import { iso } from "@/lib/time";
import { bodyClockOf } from "@/modules/arrange/core/body-clock";
import { AWAKE, weekFrom } from "@/modules/arrange/core/plan";
import {
  dayView,
  type Item,
  mayMove,
  replanSpan,
  sharpRuns,
  timeZoneOf,
} from "@/modules/planner/core/items";
import type { TaskRow } from "@/modules/planner/core/queries";
import {
  useNow,
  usePlannerData,
  useReplanning,
} from "@/modules/planner/ui/planner";
import { Block, Due } from "./Block";
import { useGoToDate, useShownDate } from "./DayView";
import { ReadingAll } from "./ReadingAll";
import { Reschedule } from "./Reschedule";
import { Unplanned } from "./Unplanned";
import styles from "./week.module.css";

// FullCalendar formats its day headers differently on the server and in the
// browser, so it renders in the browser only (its usual setup with Next.js).
const Calendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => <div className={styles.placeholder} />,
});

export function WeekView() {
  const planner = usePlannerData();
  const { now } = useNow();
  const tz = timeZoneOf(planner);
  const shown = useShownDate(now.toPlainDate());
  const sunday = shown.subtract({ days: shown.dayOfWeek % 7 });
  const go = useGoToDate();

  const clock = bodyClockOf(planner.settings ?? {});
  // A plan being made shows on the days it touches: a wave across them.
  const replanning = useReplanning();
  const plan = weekFrom(now);
  // Day can reschedule any of the shown days the plan covers.
  const ahead = Array.from({ length: 7 }, (_, d) =>
    sunday.add({ days: d }),
  ).filter((day) => plan.some((w) => w.start.toPlainDate().equals(day)));
  const events: EventInput[] = [];
  let wave = 0;
  for (let d = 0; d < 7; d++) {
    const span = replanning
      ? replanSpan(
          replanning,
          sunday.add({ days: d }),
          now,
          plan[plan.length - 1].end,
        )
      : null;
    if (span) {
      events.push({
        id: `replan-${d}`,
        start: iso(span.from),
        end: iso(span.to),
        display: "background",
        className: `${styles.wave} ${styles[`wave${wave % 7}`]} replan-cell`,
      });
      wave++;
    }
    // The student's sharpest hours, faint behind each day's blocks.
    for (const [first, end] of sharpRuns(clock)) {
      const day = sunday.add({ days: d });
      events.push({
        id: `sharp-${d}-${first}`,
        start: `${day}T${String(first).padStart(2, "0")}:00:00`,
        end:
          end === 24
            ? day.add({ days: 1 }).toString()
            : `${day}T${String(end).padStart(2, "0")}:00:00`,
        display: "background",
        className: styles.sharp,
      });
    }
    const { items, due } = dayView(planner, sunday.add({ days: d }), now);
    for (const item of items) {
      events.push({
        id: item.key,
        start: iso(item.start),
        end: iso(item.end),
        // In the data, so the calendar redraws the block when it starts breathing.
        extendedProps: {
          item,
          moving: !!replanning && mayMove(item, replanning, now),
        },
      });
    }
    for (const task of due) {
      events.push({
        id: task.id,
        start: sunday.add({ days: d }).toString(),
        allDay: true,
        extendedProps: { due: task },
      });
    }
  }

  const { hours } = clock;
  const firstAwake = hours
    ? hours.findIndex((share, h) => h >= 5 && share >= AWAKE)
    : -1;
  const startHour = firstAwake >= 0 ? firstAwake : 7;
  const short = { month: "short", day: "numeric" } as const;
  const label = `${sunday.toLocaleString("en-US", short)} – ${sunday.add({ days: 6 }).toLocaleString("en-US", short)}`;

  return (
    <Flex direction="column" gap="5">
      <Flex justify="between" align="end" gap="4">
        <Heading size="8" className={styles.big}>
          {label}
        </Heading>
        <Flex gap="4" align="center">
          <Flex gap="1" align="center">
            <IconButton
              variant="ghost"
              color="gray"
              aria-label="Previous week"
              onClick={() => go(sunday.subtract({ days: 7 }))}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Button variant="ghost" color="gray" onClick={() => go(null)}>
              Today
            </Button>
            <IconButton
              variant="ghost"
              color="gray"
              aria-label="Next week"
              onClick={() => go(sunday.add({ days: 7 }))}
            >
              <ChevronRightIcon />
            </IconButton>
          </Flex>
          <ReadingAll />
          <Reschedule days={ahead} />
        </Flex>
      </Flex>
      <Unplanned />
      <div className={styles.calendar}>
        <Calendar
          key={sunday.toString()}
          plugins={[timeGridPlugin, classicThemePlugin]}
          initialView="timeGridWeek"
          initialDate={sunday.toString()}
          now={iso(now)}
          headerToolbar={false}
          firstDay={0}
          slotMinTime={`${String(startHour).padStart(2, "0")}:00:00`}
          slotMaxTime="24:00:00"
          allDayText="Due"
          nowIndicator
          slotEventOverlap={false}
          height="auto"
          eventColor="transparent"
          dayHeaderFormat={{ weekday: "short", day: "numeric" }}
          events={events}
          eventContent={(arg) => {
            const { item, due, moving } = arg.event.extendedProps as {
              item?: Item;
              due?: TaskRow;
              moving?: boolean;
            };
            if (due) return <Due task={due} tz={tz} fill />;
            return item ? <Block item={item} compact moving={moving} /> : null;
          }}
        />
      </div>
    </Flex>
  );
}
