"use client";

import { Button, Flex, Heading, Popover, Text } from "@radix-ui/themes";
import type { Temporal } from "temporal-polyfill";
import { useDeleteLimit, usePlannerData } from "@/modules/planner/ui/planner";
import { AskInPlace } from "./AskInPlace";

function amount(minutes: number): string {
  if (!minutes) return "no work";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `at most ${hours}h`;
}

/** A lighter day from Reschedule ("I feel sick today"), shown so it can be taken back. */
export function LimitChip({ date }: { date: Temporal.PlainDate }) {
  const planner = usePlannerData();
  const remove = useDeleteLimit();
  const limit = planner.limits.find((l) => l.day === date.toString());
  if (!limit) return null;
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button size="1" variant="soft" color="amber">
          Light day · {amount(limit.minutes)}
        </Button>
      </Popover.Trigger>
      <Popover.Content width="300px" align="start">
        <Flex direction="column" gap="2">
          <Heading size="3">Light day</Heading>
          <Text size="2">
            {limit.minutes
              ? `At most ${amount(limit.minutes).replace("at most ", "")} of work`
              : "No work"}
            {limit.minutes && !limit.deep ? ", nothing heavy." : "."}
          </Text>
          <Flex mt="2">
            <AskInPlace
              question="Delete this?"
              yes="Delete"
              onYes={() => remove.mutate({ id: limit.id })}
            >
              Delete
            </AskInPlace>
          </Flex>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
