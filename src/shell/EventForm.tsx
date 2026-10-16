"use client";

import { Button, Flex, Text, TextArea, TextField } from "@radix-ui/themes";
import { type ReactElement, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { hhmm, iso, zoned } from "@/lib/time";
import { timeZoneOf } from "@/modules/planner/core/items";
import type { EventDraft } from "@/modules/planner/core/queries";
import { usePlannerData } from "@/modules/planner/ui/planner";

/** Esc with unsaved changes asks "Save changes?" instead of closing. */
export function useDraftGuard() {
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  return {
    dirty,
    setDirty,
    asking,
    setAsking,
    onEscapeKeyDown: (event: KeyboardEvent) => {
      if (dirty) {
        event.preventDefault();
        setAsking(true);
      }
    },
  };
}

interface Initial {
  title: string | null;
  details: string | null;
  start: string;
  minutes: number;
}

/** The student's own block: a class, work, anything with a time. */
export function EventForm({
  guard,
  initial,
  onSave,
  close,
}: {
  guard: ReturnType<typeof useDraftGuard>;
  initial: Initial;
  onSave: (draft: EventDraft) => void;
  close?: ReactElement;
}) {
  const tz = timeZoneOf(usePlannerData());
  const start = zoned(initial.start, tz);
  const [title, setTitle] = useState(initial.title ?? "");
  const [date, setDate] = useState(start.toPlainDate().toString());
  const [from, setFrom] = useState(hhmm(start));
  const [to, setTo] = useState(hhmm(start.add({ minutes: initial.minutes })));
  const [details, setDetails] = useState(initial.details ?? "");

  const draft = toDraft(tz, title, date, from, to, details);
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      guard.setDirty(true);
    };
  const save = () => {
    if (!draft) return;
    guard.setDirty(false);
    guard.setAsking(false);
    onSave(draft);
  };

  if (guard.asking) {
    return (
      <Flex direction="column" gap="3">
        <Text size="3" weight="medium">
          Save changes?
        </Text>
        <Flex gap="2">
          <Button autoFocus disabled={!draft} onClick={save}>
            Save
          </Button>
          {close}
        </Flex>
      </Flex>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Flex direction="column" gap="3">
        <Text as="label" htmlFor="event-title">
          <Text size="2" weight="medium" as="div">
            Title
          </Text>
          <TextField.Root
            id="event-title"
            value={title}
            maxLength={120}
            onChange={(e) => change(setTitle)(e.target.value)}
          />
        </Text>
        <Flex gap="2">
          <Text as="label" htmlFor="event-date" style={{ flex: 2 }}>
            <Text size="2" weight="medium" as="div">
              Date
            </Text>
            <TextField.Root
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => change(setDate)(e.target.value)}
            />
          </Text>
          <Text as="label" htmlFor="event-start" style={{ flex: 1 }}>
            <Text size="2" weight="medium" as="div">
              Start
            </Text>
            <TextField.Root
              id="event-start"
              type="time"
              value={from}
              onChange={(e) => change(setFrom)(e.target.value)}
            />
          </Text>
          <Text as="label" htmlFor="event-end" style={{ flex: 1 }}>
            <Text size="2" weight="medium" as="div">
              End
            </Text>
            <TextField.Root
              id="event-end"
              type="time"
              value={to}
              onChange={(e) => change(setTo)(e.target.value)}
            />
          </Text>
        </Flex>
        <Text as="label" htmlFor="event-details">
          <Text size="2" weight="medium" as="div">
            Details
          </Text>
          <TextArea
            id="event-details"
            value={details}
            maxLength={2000}
            onChange={(e) => change(setDetails)(e.target.value)}
          />
        </Text>
        <Flex>
          <Button type="submit" disabled={!draft}>
            Save
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}

function toDraft(
  tz: string,
  title: string,
  date: string,
  from: string,
  to: string,
  details: string,
): EventDraft | null {
  try {
    const day = Temporal.PlainDate.from(date);
    const start = day.toZonedDateTime({
      timeZone: tz,
      plainTime: Temporal.PlainTime.from(from),
    });
    const end = day.toZonedDateTime({
      timeZone: tz,
      plainTime: Temporal.PlainTime.from(to),
    });
    const minutes = Math.round(
      (end.epochMilliseconds - start.epochMilliseconds) / 60_000,
    );
    if (!title.trim() || minutes <= 0) return null;
    return {
      title: title.trim(),
      details: details.trim() || null,
      start: iso(start),
      minutes,
    };
  } catch {
    return null;
  }
}
