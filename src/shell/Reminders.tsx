"use client";

import { Checkbox, Flex, Text, TextField } from "@radix-ui/themes";
import { useState } from "react";
import {
  useAddReminder,
  usePlannerData,
  useSetReminderDone,
} from "@/modules/planner/ui/planner";

/** Stray thoughts, written down so they stop nagging: "buy food". */
export function Reminders({ compact }: { compact?: boolean }) {
  const planner = usePlannerData();
  const add = useAddReminder();
  const setDone = useSetReminderDone();
  const [text, setText] = useState("");
  const open = planner.reminders.filter((r) => !r.done);

  return (
    <Flex direction="column" gap="2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const line = text.trim();
          if (!line) return;
          add.mutate({ id: crypto.randomUUID(), text: line.slice(0, 200) });
          setText("");
        }}
      >
        <Flex gap="3" align="center">
          <Text as="label" htmlFor="reminder" size="2" weight="medium">
            Reminders
          </Text>
          <TextField.Root
            id="reminder"
            value={text}
            maxLength={200}
            onChange={(event) => setText(event.target.value)}
            style={{ width: compact ? 240 : 320 }}
          />
        </Flex>
      </form>
      {!compact && open.length > 0 && (
        <Flex gap="4" wrap="wrap">
          {open.map((r) => (
            <Text as="label" key={r.id} size="2">
              <Flex gap="2" align="center">
                <Checkbox
                  checked={r.done}
                  onCheckedChange={() =>
                    setDone.mutate({ id: r.id, done: true })
                  }
                />
                {r.text}
              </Flex>
            </Text>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
