"use client";

import { Button, Flex, Text } from "@radix-ui/themes";
import { createContext, useContext, useState } from "react";
import { bodyClockOf, inShort } from "@/modules/arrange/core/body-clock";
import {
  type Rescheduled,
  type Scope,
  usePlannerData,
  useUndoReschedule,
  type WalkUndo,
} from "@/modules/planner/ui/planner";

// The last reschedule's answer: a line of advice on what's wrong (when there
// is one), what moved, what the student's words changed, and Undo. It always shows on the header's Reschedule button, so it stays in
// reach even when the session it started from has moved away.

export interface Last {
  id: number;
  data: Rescheduled;
  scope: Scope;
  fromSession: boolean;
}

const LastContext = createContext<{
  last: Last | null;
  /** A reschedule that failed, said on the same button. */
  failed: { id: number; message: string } | null;
  /** Shows a result; returns its id. */
  show: (data: Rescheduled, scope: Scope, fromSession: boolean) => number;
  /** The walks planned after result `id`: its Undo takes them back too. */
  addWalks: (id: number, walks: WalkUndo) => void;
  fail: (message: string) => void;
  clear: () => void;
} | null>(null);

export function LastRescheduleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [last, setLast] = useState<Last | null>(null);
  const [failed, setFailed] = useState<{
    id: number;
    message: string;
  } | null>(null);
  return (
    <LastContext.Provider
      value={{
        last,
        failed,
        show: (data, scope, fromSession) => {
          const id = Date.now();
          setFailed(null);
          setLast({ id, data, scope, fromSession });
          return id;
        },
        addWalks: (id, walks) =>
          setLast((l) =>
            l?.id === id
              ? {
                  ...l,
                  data: {
                    ...l.data,
                    undo: {
                      remove: {
                        ...l.data.undo.remove,
                        blocks: [...l.data.undo.remove.blocks, ...walks.added],
                      },
                      restore: {
                        ...l.data.undo.restore,
                        nature: [
                          ...(l.data.undo.restore.nature ?? []),
                          ...walks.removed,
                        ],
                      },
                    },
                  },
                }
              : l,
          ),
        fail: (message) => {
          setLast(null);
          setFailed({ id: Date.now(), message });
        },
        clear: () => {
          setLast(null);
          setFailed(null);
        },
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
  const clock = bodyClockOf(usePlannerData().settings ?? {});
  const { moved, placed, unplaced, changes, advice } = last.data;
  const summary =
    last.scope === "week" && !last.fromSession
      ? `Planned ${placed} ${placed === 1 ? "session" : "sessions"}.`
      : moved
        ? `Moved ${moved} ${moved === 1 ? "session" : "sessions"}.`
        : "Nothing to move.";
  return (
    <Flex direction="column" gap="2">
      {advice && <Text size="2">{advice}</Text>}
      <Text size="2" weight="medium">
        {summary}
      </Text>
      {last.scope === "week" && placed > 0 && (
        <Text size="2" color="gray">
          Around your body clock: {inShort(clock)}.
        </Text>
      )}
      {changes.map((change) => (
        <Text key={change} size="2">
          {change}
        </Text>
      ))}
      {unplaced > 0 && (
        <Text size="2" color="gray">
          {unplaced} min didn't fit.
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
