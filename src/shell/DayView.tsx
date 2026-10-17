"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Button, Flex, Heading, IconButton, Text } from "@radix-ui/themes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { clock } from "@/lib/time";
import { bodyClockOf } from "@/modules/arrange/core/body-clock";
import {
  current,
  dayView,
  timeZoneOf,
  titleOf,
} from "@/modules/planner/core/items";
import { useNow, usePlannerData } from "@/modules/planner/ui/planner";
import { Due } from "./Block";
import styles from "./day.module.css";
import { Feeds } from "./Feeds";
import { LimitChip } from "./LimitChip";
import { ReadingAll } from "./ReadingAll";
import { Reschedule } from "./Reschedule";
import { Timeline } from "./Timeline";

const WEEKDAY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function DayView() {
  const planner = usePlannerData();
  const { now } = useNow();
  const date = useShownDate(now.toPlainDate());
  const today = date.equals(now.toPlainDate());
  const { items, due } = dayView(planner, date, now);
  const sessions = items.filter((i) => i.kind === "session");
  const done = sessions.filter(
    (i) => i.kind === "session" && i.block.done,
  ).length;
  const happening = today ? current(items, now) : undefined;

  if (planner.tasks.length === 0) {
    return (
      <Flex direction="column" gap="4" className={styles.empty}>
        <Heading size="6">Canvas</Heading>
        <Feeds />
      </Flex>
    );
  }

  return (
    <div className={styles.day}>
      <header className={styles.head}>
        <Heading size="8" className={styles.big}>
          {WEEKDAY[date.dayOfWeek - 1]}
          {today && <span className={styles.clock}> {clock(now)}</span>}
        </Heading>
        <Flex gap="4" align="center">
          <DayNav date={date} today={today} />
          <Text size="2" color="gray" className={styles.progress}>
            {done}/{sessions.length} done
          </Text>
          <ReadingAll />
          <Reschedule />
        </Flex>
        <Text size="3" color="gray">
          {today
            ? happening
              ? `Now: ${titleOf(happening)}`
              : "Now: free"
            : date.toLocaleString("en-US", { month: "long", day: "numeric" })}
        </Text>
      </header>

      {(due.length > 0 ||
        planner.limits.some((l) => l.day === date.toString())) && (
        <Flex gap="2" align="center" wrap="wrap">
          <LimitChip date={date} />
          {due.length > 0 && (
            <>
              <Text size="2" color="gray" mr="1">
                Due
              </Text>
              {due.map((task) => (
                <Due key={task.id} task={task} tz={timeZoneOf(planner)} />
              ))}
            </>
          )}
        </Flex>
      )}

      <Timeline
        items={items}
        hours={bodyClockOf(planner.settings ?? {}).hours}
        now={today ? now : null}
      />
    </div>
  );
}

/** The day in the URL (`?date=YYYY-MM-DD`), else today. */
export function useShownDate(today: Temporal.PlainDate): Temporal.PlainDate {
  const param = useSearchParams().get("date");
  try {
    return param ? Temporal.PlainDate.from(param) : today;
  } catch {
    return today;
  }
}

function DayNav({ date, today }: { date: Temporal.PlainDate; today: boolean }) {
  const go = useGoToDate();
  return (
    <Flex gap="1" align="center">
      <IconButton
        variant="ghost"
        color="gray"
        aria-label="Previous day"
        onClick={() => go(date.subtract({ days: 1 }))}
      >
        <ChevronLeftIcon />
      </IconButton>
      <Button
        variant="ghost"
        color="gray"
        disabled={today}
        onClick={() => go(null)}
      >
        Today
      </Button>
      <IconButton
        variant="ghost"
        color="gray"
        aria-label="Next day"
        onClick={() => go(date.add({ days: 1 }))}
      >
        <ChevronRightIcon />
      </IconButton>
    </Flex>
  );
}

export function useGoToDate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (date: Temporal.PlainDate | null) => {
    const next = new URLSearchParams(params.toString());
    if (date) next.set("date", date.toString());
    else next.delete("date");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };
}
