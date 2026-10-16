"use client";

import {
  Button,
  Flex,
  SegmentedControl,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useState } from "react";
import {
  type Scope,
  useNow,
  useReschedule,
} from "@/modules/planner/ui/planner";
import { useLastReschedule } from "./RescheduleResult";

/**
 * Reschedule asks what's wrong and how much may move: the next hour, today,
 * or the whole school week. The answer shows on the header's Reschedule
 * button (see RescheduleResult), with Undo.
 */
export function RescheduleForm({
  dismiss,
  defaultScope,
}: {
  dismiss?: string;
  defaultScope: Scope;
}) {
  const reschedule = useReschedule();
  const { show } = useLastReschedule();
  const { at } = useNow();
  const [answer, setAnswer] = useState("");
  const [scope, setScope] = useState<Scope>(defaultScope);

  if (reschedule.isPending) {
    return (
      <Flex gap="2" align="center">
        <Spinner />
        <Text size="2">Rescheduling</Text>
      </Flex>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        reschedule.mutate(
          { at, scope, answer: answer.trim() || undefined, dismiss },
          { onSuccess: (data) => show(data, scope, !!dismiss) },
        );
      }}
    >
      <Flex direction="column" gap="3">
        <Text as="label" htmlFor="whats-wrong" size="3" weight="medium">
          What's wrong?
        </Text>
        <TextField.Root
          id="whats-wrong"
          autoFocus
          value={answer}
          maxLength={500}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium" id="move-label">
            Move
          </Text>
          <SegmentedControl.Root
            aria-labelledby="move-label"
            value={scope}
            onValueChange={(value) => setScope(value as Scope)}
          >
            <SegmentedControl.Item value="hour">Hour</SegmentedControl.Item>
            <SegmentedControl.Item value="day">Day</SegmentedControl.Item>
            <SegmentedControl.Item value="week">Week</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
        {reschedule.isError && (
          <Text size="2" color="red">
            {reschedule.error.message}
          </Text>
        )}
        <Flex>
          <Button type="submit">Reschedule</Button>
        </Flex>
      </Flex>
    </form>
  );
}
