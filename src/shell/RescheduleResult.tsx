"use client";

import { Button, Flex, Text } from "@radix-ui/themes";
import { createContext, useContext, useState } from "react";
import {
  type Rescheduled,
  type Scope,
  useUndoReschedule,
} from "@/modules/planner/ui/planner";

// The last reschedule's answer: what moved, what the student's words changed,
// and Undo. It always shows on the header's Reschedule button, so it stays in
// reach even when the session it started from has moved away.

export interface Last {
  id: number;
  data: Rescheduled;
  scope: Scope;
  fromSession: boolean;
}

const LastContext = createContext<{
  last: Last | null;
  show: (data: Rescheduled, scope: Scope, fromSession: boolean) => void;
  clear: () => void;
} | null>(null);

export function LastRescheduleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [last, setLast] = useState<Last | null>(null);
  return (
    <LastContext.Provider
      value={{
        last,
        show: (data, scope, fromSession) =>
          setLast({ id: Date.now(), data, scope, fromSession }),
        clear: () => setLast(null),
      }}
    >
      {children}
    </LastContext.Provider>
  );
}

export function useLastReschedule() {
  const value = useContext(LastContext);
  if (!value) throw new Error("useLastReschedule needs LastRescheduleProvider");
  return value;
}

export function RescheduleResult({ last }: { last: Last }) {
  const undo = useUndoReschedule();
  const { moved, placed, unplaced, changes } = last.data;
  const summary =
    last.scope === "week" && !last.fromSession
      ? `Planned ${placed} ${placed === 1 ? "session" : "sessions"} this week.`
      : moved
        ? `Moved ${moved} ${moved === 1 ? "session" : "sessions"}.`
        : "Nothing to move.";
  return (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        {summary}
      </Text>
      {changes.map((change) => (
        <Text key={change} size="2">
          {change}
        </Text>
      ))}
      {unplaced > 0 && (
        <Text size="2" color="gray">
          {unplaced} min didn't fit this week.
        </Text>
      )}
      <Flex mt="1">
        <Button
          variant="soft"
          color="gray"
          loading={undo.isPending}
          disabled={undo.isSuccess}
          onClick={() => undo.mutate(last.data.undo)}
        >
          {undo.isSuccess ? "Undone" : "Undo"}
        </Button>
      </Flex>
    </Flex>
  );
}
