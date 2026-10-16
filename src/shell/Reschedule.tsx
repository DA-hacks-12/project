"use client";

import {
  Button,
  Flex,
  Heading,
  Popover,
  Separator,
  Text,
} from "@radix-ui/themes";
import { useIsMutating } from "@tanstack/react-query";
import { useState } from "react";
import { clock, shortDate, zoned } from "@/lib/time";
import { biggestPriority, timeZoneOf } from "@/modules/planner/core/items";
import {
  rescheduleKey,
  useNow,
  usePlannerData,
} from "@/modules/planner/ui/planner";
import { RescheduleForm } from "./RescheduleForm";
import { RescheduleResult, useLastReschedule } from "./RescheduleResult";

/**
 * The header's Reschedule: asks what's wrong and how much may move, then shows
 * what changed and the biggest priority. Before anything is planned this week
 * it offers the whole week; after that, today.
 */
export function Reschedule() {
  const planner = usePlannerData();
  const { now } = useNow();
  const [open, setOpen] = useState(false);
  const { last, clear } = useLastReschedule();
  const [seen, setSeen] = useState<number | null>(null);
  // A new answer, wherever it came from, opens here.
  if (last && last.id !== seen) {
    setSeen(last.id);
    setOpen(true);
  }
  // Any reschedule in flight: this button's, a session card's, or one after a new block.
  const busy = useIsMutating({ mutationKey: rescheduleKey }) > 0;
  const planned = planner.blocks.some(
    (b) =>
      b.kind === "session" &&
      !b.done &&
      Date.parse(b.start) >= now.epochMilliseconds,
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) clear();
      }}
    >
      <Popover.Trigger>
        <Button loading={busy && !open}>Reschedule</Button>
      </Popover.Trigger>
      <Popover.Content width="340px" align="end">
        {last ? (
          <>
            <RescheduleResult last={last} />
            <BiggestPriority />
          </>
        ) : (
          <RescheduleForm defaultScope={planned ? "day" : "week"} />
        )}
      </Popover.Content>
    </Popover.Root>
  );
}

/** The open tasks due soonest, then with the most work left. */
function BiggestPriority() {
  const planner = usePlannerData();
  const { now } = useNow();
  const tz = timeZoneOf(planner);
  const top = biggestPriority(planner, now);
  if (!top.length) return null;
  return (
    <Flex direction="column" gap="3" mt="2">
      <Separator size="4" />
      <Heading size="3">Biggest priority</Heading>
      {top.map((task) => {
        const due = zoned(task.due, tz);
        return (
          <Flex key={task.id} direction="column">
            <Text size="2" weight="medium">
              {task.title}
            </Text>
            <Text size="1" color="gray">
              Due {shortDate(due)}, {clock(due)}
              {task.minutes ? ` · about ${task.minutes} min` : ""}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}
