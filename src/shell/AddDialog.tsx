"use client";

import { Button, Dialog } from "@radix-ui/themes";
import { useState } from "react";
import { iso } from "@/lib/time";
import {
  useAddEvent,
  useConflict,
  useNow,
  useRescheduleAround,
} from "@/modules/planner/ui/planner";
import { EventForm, useDraftGuard } from "./EventForm";

/** "+": the student's own block, such as a class or a shift at work. */
export function AddDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const guard = useDraftGuard();
  const add = useAddEvent();
  const around = useRescheduleAround();
  const conflict = useConflict();
  const { now } = useNow();
  const next = now.round({ smallestUnit: "hour", roundingMode: "ceil" });
  const { setDirty, setAsking } = guard;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setDirty(false);
          setAsking(false);
        }
      }}
    >
      <Dialog.Trigger>{children}</Dialog.Trigger>
      <Dialog.Content maxWidth="440px" onEscapeKeyDown={guard.onEscapeKeyDown}>
        <Dialog.Title>Add</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3" hidden>
          A block of your own
        </Dialog.Description>
        {open && (
          <EventForm
            guard={guard}
            initial={{
              title: null,
              details: null,
              start: iso(next),
              minutes: 60,
            }}
            conflict={(start, minutes) =>
              conflict({ kind: "event", start, minutes })
            }
            onSave={(draft) => {
              const id = crypto.randomUUID();
              add.mutate({ id, draft }, { onSuccess: () => around(draft, id) });
              setOpen(false);
            }}
            close={
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Don't save
                </Button>
              </Dialog.Close>
            }
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
