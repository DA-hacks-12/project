"use client";

import { Flex, Text } from "@radix-ui/themes";
import { weekFrom } from "@/modules/arrange/core/plan";
import { timeZoneOf, unplanned } from "@/modules/planner/core/items";
import { useNow, usePlannerData } from "@/modules/planner/ui/planner";
import { Due } from "./Block";

/**
 * The work the plan hasn't placed: open tasks due by its last day whose
 * sessions don't cover their minutes yet (it didn't fit, or it's still being
 * planned). Course-coloured chips, each with what's left; one opens its card.
 */
export function Unplanned() {
  const planner = usePlannerData();
  const { now } = useNow();
  const plan = weekFrom(now);
  const left = unplanned(planner, now, plan[plan.length - 1].end);
  if (!left.length) return null;
  return (
    <Flex gap="2" align="center" wrap="wrap">
      <Text size="2" color="gray" mr="1">
        Unplanned
      </Text>
      {left.map(({ task, left: minutes }) => (
        <Due
          key={task.id}
          task={task}
          tz={timeZoneOf(planner)}
          left={minutes}
        />
      ))}
    </Flex>
  );
}
