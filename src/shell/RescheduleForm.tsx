"use client";

import {
  Button,
  Flex,
  SegmentedControl,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useState } from "react";
import type { Temporal } from "temporal-polyfill";
import {
  askLocation,
  type Scope,
  useNow,
  useReschedule,
  useWalks,
} from "@/modules/planner/ui/planner";
import { useLastReschedule } from "./RescheduleResult";
import styles from "./reschedule.module.css";

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Reschedule asks what's wrong and how much may move: a day, or the whole
 * plan. The answer shows on the header's Reschedule button (see
 * RescheduleResult), with Undo.
 */
export function RescheduleForm({
  dismiss,
  defaultScope,
  days = [],
  onStart,
}: {
  dismiss?: string;
  defaultScope: Scope;
  /** The days Day can mean, the first chosen; more than one shows them. Today when empty. */
  days?: Temporal.PlainDate[];
  /** Called as it starts: the card closes and the calendar shows the work. */
  onStart?: () => void;
}) {
  const reschedule = useReschedule();
  const walks = useWalks();
  const { show, fail, addWalks } = useLastReschedule();
  const { at } = useNow();
  const [answer, setAnswer] = useState("");
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [day, setDay] = useState(days[0]?.toString());

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // At the click, so the browser shows its prompt (the walks need it).
        askLocation();
        onStart?.();
        // Not `mutate`'s own callback: it is dropped once this card closes,
        // and the answer (with its Undo), or the failure, must still arrive.
        reschedule
          .mutateAsync({
            at,
            scope,
            day: scope === "day" ? day : undefined,
            answer: answer.trim() || undefined,
            dismiss,
          })
          .then((data) => {
            const id = show(data, scope, !!dismiss);
            // The walks on the days that changed, after the plan shows.
            return walks(data.walkDays).then((w) => w && addWalks(id, w));
          })
          .catch((error: unknown) =>
            fail(
              error instanceof Error && error.message !== "Signed out"
                ? error.message
                : "Couldn't reschedule. Try again.",
            ),
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
            <SegmentedControl.Item value="day">Day</SegmentedControl.Item>
            <SegmentedControl.Item value="week">Week</SegmentedControl.Item>
          </SegmentedControl.Root>
          {scope === "day" && days.length > 1 && (
            <SegmentedControl.Root
              aria-label="Day"
              className={styles.days}
              value={day}
              onValueChange={setDay}
            >
              {days.map((d) => (
                <SegmentedControl.Item key={d.toString()} value={d.toString()}>
                  {WEEKDAY[d.dayOfWeek - 1]}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
          )}
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
