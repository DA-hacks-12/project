"use client";

import {
  Button,
  Checkbox,
  Flex,
  Heading,
  Link,
  Popover,
  Text,
  Theme,
} from "@radix-ui/themes";
import NextLink from "next/link";
import { Tooltip } from "radix-ui";
import { type CSSProperties, useEffect, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { clock, clockRange, duration, shortDate, zoned } from "@/lib/time";
import { bodyClockOf } from "@/modules/arrange/core/body-clock";
import {
  type Item,
  isReading,
  timeZoneOf,
  titleOf,
  whyHere,
} from "@/modules/planner/core/items";
import type { TaskRow } from "@/modules/planner/core/queries";
import {
  useConflict,
  useCourseColor,
  useDeleteBlock,
  useKeep,
  useMoveSession,
  useNow,
  usePlannerData,
  usePlanWalks,
  useRescheduleAround,
  useSetBlockDone,
  useSetTaskDone,
  useUpdateEvent,
} from "@/modules/planner/ui/planner";
import {
  mapLink,
  type NatureStop,
  walkMinutes,
} from "@/modules/suggest/core/places";
import { directionsLink } from "@/modules/suggest/core/walk";
import { AskInPlace } from "./AskInPlace";
import styles from "./block.module.css";
import { EventForm, useDraftGuard } from "./EventForm";
import {
  CardMap,
  MapPicture,
  type Picture,
  preparePicture,
  preparePictureAhead,
} from "./MapPicture";
import { RescheduleForm } from "./RescheduleForm";
import { Tree } from "./Tree";

const KIND_CLASS: Record<Item["kind"], string> = {
  session: styles.session,
  break: styles.break,
  event: styles.event,
  nature: styles.nature,
  class: styles.event, // a class is one of the student's fixed plans, like an event
};

/** Any block on the calendar, in one solid color. Clicking it opens its card in place. */
export function Block({
  item,
  compact,
  narrow,
  moving,
}: {
  item: Item;
  /** In the week grid: one line of title, then the time. */
  compact?: boolean;
  /** Too slim for a time range: just when it starts. */
  narrow?: boolean;
  /** It may move in the replan under way: it breathes. */
  moving?: boolean;
}) {
  const guard = useDraftGuard();
  const courseColor = useCourseColor();
  const done =
    item.kind === "session" && (item.block.done || item.task?.done === true);
  const fill =
    item.kind === "session"
      ? ({ "--fill": courseColor(item.task?.course) } as CSSProperties)
      : undefined;
  const minutes =
    (item.end.epochMilliseconds - item.start.epochMilliseconds) / 60_000;
  const classes = [
    styles.block,
    KIND_CLASS[item.kind],
    done && styles.done,
    compact && styles.compact,
    compact && minutes <= 40 && styles.line,
    narrow && styles.narrow,
    moving && "replan-moving",
  ].filter(Boolean);
  const [open, setOpen] = useState(false);
  const button = (
    <button
      type="button"
      className={classes.join(" ")}
      style={fill}
      data-kind={item.kind}
    >
      {compact && <span className={styles.title}>{titleOf(item)}</span>}
      <span className={styles.time}>
        {narrow ? clock(item.start) : clockRange(item.start, item.end)}
      </span>
      {!compact && <span className={styles.title}>{titleOf(item)}</span>}
      {item.kind === "session" && !compact && (
        <span className={styles.sub}>{item.task?.course}</span>
      )}
    </button>
  );
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {item.kind === "nature" ? (
        <MapPreview place={item.place} hidden={open}>
          <Popover.Trigger>{button}</Popover.Trigger>
        </MapPreview>
      ) : (
        <Popover.Trigger>{button}</Popover.Trigger>
      )}
      <Popover.Content
        width="340px"
        side="right"
        align="start"
        collisionPadding={12}
        onEscapeKeyDown={guard.onEscapeKeyDown}
      >
        <BlockCard item={item} guard={guard} close={() => setOpen(false)} />
      </Popover.Content>
    </Popover.Root>
  );
}

function BlockCard({
  item,
  guard,
  close,
}: {
  item: Item;
  guard: ReturnType<typeof useDraftGuard>;
  close: () => void;
}) {
  switch (item.kind) {
    case "session":
      return <SessionCard item={item} guard={guard} close={close} />;
    case "event":
      return <EventCard item={item} guard={guard} />;
    case "break":
      return <BreakCard item={item} />;
    case "nature":
      return <NatureCard item={item} />;
    case "class":
      return <ClassCard item={item} />;
  }
}

/** A class, from the schedule uploaded in Options (changed there, not here). */
function ClassCard({ item }: { item: Extract<Item, { kind: "class" }> }) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="3">{item.rule.title}</Heading>
      <When item={item} extra={item.rule.place ?? undefined} />
    </Flex>
  );
}

function When({ item, extra }: { item: Item; extra?: string }) {
  return (
    <Text as="p" size="2" color="gray">
      {clockRange(item.start, item.end)}
      {extra ? ` · ${extra}` : ""}
    </Text>
  );
}

function TaskDetails({ task }: { task: TaskRow }) {
  return (
    <>
      {task.deliverable && (
        <Text as="p" size="2">
          {task.deliverable}
        </Text>
      )}
      {task.requirements.length > 0 && (
        <ul className={styles.list}>
          {task.requirements.map((r) => (
            <li key={r}>
              <Text size="2">{r}</Text>
            </li>
          ))}
        </ul>
      )}
      {task.url && (
        <Link href={task.url} target="_blank" rel="noreferrer" size="2">
          Open in Canvas
        </Link>
      )}
    </>
  );
}

function SessionCard({
  item,
  guard,
  close,
}: {
  item: Extract<Item, { kind: "session" }>;
  guard: ReturnType<typeof useDraftGuard>;
  close: () => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [editing, setEditing] = useState(false);
  const setDone = useSetBlockDone();
  const move = useMoveSession();
  const conflict = useConflict();
  const planWalks = usePlanWalks();
  const planner = usePlannerData();
  const { now, at } = useNow();
  const keep = useKeep();
  const task = item.task;
  // Why it sits here, where that's true (plain code over the plan).
  const reasons = whyHere(item, planner, bodyClockOf(planner.settings ?? {}));

  // Rescheduling from a session: that session moves (and its task waits an
  // hour), plus whatever the scope opens up. Day means the session's day.
  if (rescheduling) {
    const day = item.start.toPlainDate();
    return (
      <RescheduleForm
        dismiss={item.block.id}
        defaultScope="day"
        days={
          Temporal.PlainDate.compare(day, now.toPlainDate()) > 0 ? [day] : []
        }
        onStart={close}
      />
    );
  }

  // Moving it by hand: a time that clashes can't be saved. A nature
  // suggestion it now covers is planned again for that day.
  if (editing)
    return (
      <EventForm
        guard={guard}
        timeOnly
        initial={item.block}
        conflict={(start, minutes) =>
          conflict({
            kind: "session",
            start,
            minutes,
            id: item.block.id,
            taskId: item.block.task_id,
          })
        }
        onSave={({ start, minutes }) => {
          const tz = timeZoneOf(planner);
          const from = Date.parse(start);
          const to = from + minutes * 60_000;
          const covers = planner.blocks.some(
            (b) =>
              b.kind === "nature" &&
              Date.parse(b.start) < to &&
              Date.parse(b.start) + b.minutes * 60_000 > from,
          );
          move.mutate(
            { id: item.block.id, start, minutes },
            {
              onSuccess: () => {
                if (covers)
                  planWalks.mutate({
                    dates: [zoned(start, tz).toPlainDate().toString()],
                    at,
                  });
              },
            },
          );
          setEditing(false);
        }}
        close={
          <Popover.Close>
            <Button variant="soft" color="gray">
              Don't save
            </Button>
          </Popover.Close>
        }
      />
    );

  return (
    <Flex direction="column" gap="2">
      <Text size="1" color="gray">
        {task?.course}
      </Text>
      <Heading size="3">{task?.title ?? "Session"}</Heading>
      <When item={item} extra={task?.work ?? undefined} />
      {reasons.length > 0 && (
        <Text as="p" size="2" color="gray">
          {reasons.join(". ")}.
        </Text>
      )}
      {task && <TaskDetails task={task} />}
      <Flex gap="2" mt="2">
        <Button asChild>
          <NextLink href={`/focus/${item.block.id}${keep}`}>Focus</NextLink>
        </Button>
        <Button
          variant="soft"
          onClick={() =>
            setDone.mutate({ id: item.block.id, done: !item.block.done })
          }
        >
          {item.block.done ? "Undo" : "Done"}
        </Button>
        <Button variant="soft" color="gray" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="soft"
          color="gray"
          onClick={() => setRescheduling(true)}
        >
          Reschedule
        </Button>
      </Flex>
    </Flex>
  );
}

function EventCard({
  item,
  guard,
}: {
  item: Extract<Item, { kind: "event" }>;
  guard: ReturnType<typeof useDraftGuard>;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateEvent();
  const conflict = useConflict();
  const around = useRescheduleAround();
  const remove = useDeleteBlock();
  if (editing) {
    return (
      <EventForm
        guard={guard}
        initial={item.block}
        conflict={(start, minutes) =>
          conflict({ kind: "event", start, minutes, id: item.block.id })
        }
        onSave={(draft) => {
          update.mutate(
            { id: item.block.id, draft },
            { onSuccess: () => around(draft, item.block.id) },
          );
          setEditing(false);
        }}
        close={
          <Popover.Close>
            <Button variant="soft" color="gray">
              Don't save
            </Button>
          </Popover.Close>
        }
      />
    );
  }
  return (
    <Flex direction="column" gap="2">
      <Heading size="3">{item.block.title}</Heading>
      <When item={item} />
      {item.block.details && (
        <Text as="p" size="2">
          {item.block.details}
        </Text>
      )}
      <Flex gap="2" mt="2">
        <Button variant="soft" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <AskInPlace
          question="Delete this?"
          yes="Delete"
          onYes={() => remove.mutate({ id: item.block.id })}
        >
          Delete
        </AskInPlace>
      </Flex>
    </Flex>
  );
}

function BreakCard({ item }: { item: Extract<Item, { kind: "break" }> }) {
  const remove = useDeleteBlock();
  return (
    <Flex direction="column" gap="2">
      <Heading size="3">{titleOf(item)}</Heading>
      <When item={item} extra={`${item.block.minutes} minutes`} />
      <Flex gap="2" mt="2">
        <AskInPlace
          question="Delete this?"
          yes="Delete"
          onYes={() => remove.mutate({ id: item.block.id })}
        >
          Delete
        </AskInPlace>
      </Flex>
    </Flex>
  );
}

/**
 * Pointing at a nature suggestion previews it: a still map of the walk and
 * the place's name. After Altay's map location preview (his map test on the
 * mapIntegration branch), with the walk measured on foot.
 *
 * It must hold still, so it's a tooltip in Radix's sense (one timing for all
 * walks, `Tooltip.Provider` in App): half a second's rest opens it, with a
 * fade; moving on to the next walk soon after swaps the next one in at once,
 * with no fade either way; a click closes it until the pointer comes back;
 * scrolling what holds the walk closes it. Its picture is made in full when
 * the pointer arrives and it opens only once that's ready, so nothing in it
 * moves. It sits where the walk's card opens: to the right, flipping left at
 * the edge.
 */
function MapPreview({
  place,
  hidden,
  children,
}: {
  place: NatureStop;
  hidden: boolean;
  children: React.ReactNode;
}) {
  const [wanted, setWanted] = useState(false);
  // The picture, or false when it couldn't be made (the name and walk alone).
  const [picture, setPicture] = useState<Picture | false | null>(null);
  // Radix decides open and closed; the card is only drawn once its picture is
  // ready. (Holding `open` back instead left Radix and this out of step: a
  // walk the pointer had left would open when its picture arrived.)
  const open = wanted && !hidden;
  const from = place.from;
  useEffect(() => {
    if (from) preparePictureAhead(from, place);
  }, [from, place]);
  if (!from) return children;
  const prepare = () => {
    // A picture already on screen stays as it is.
    if (open) return;
    preparePicture(from, place)
      .then(setPicture)
      .catch(() => setPicture((p) => p ?? false));
  };
  return (
    // Nothing in it to point at: the pointer passes through it to the walk
    // underneath (the next day's, in Week), and leaving the walk closes it.
    <Tooltip.Root open={open} onOpenChange={setWanted} disableHoverableContent>
      <Tooltip.Trigger
        asChild
        onPointerEnter={prepare}
        // Focus coming back from the walk's card doesn't open it.
        onFocus={(event) => event.preventDefault()}
      >
        {children}
      </Tooltip.Trigger>
      {picture !== null && (
        <Tooltip.Portal>
          <Theme asChild>
            <Tooltip.Content
              side="right"
              align="start"
              sideOffset={8}
              collisionPadding={12}
              className={`${styles.preview} map-preview`}
              aria-label={`${place.name}, ${walkMinutes(place)} min walk`}
            >
              {picture && <MapPicture picture={picture} />}
              <Flex
                justify="between"
                align="baseline"
                gap="3"
                className={styles.previewLabel}
              >
                <Text size="2" weight="medium" className={styles.previewName}>
                  {place.name}
                </Text>
                <Text size="1" color="gray" wrap="nowrap">
                  {place.walk?.estimate ? "About " : ""}
                  {walkMinutes(place)} min walk
                </Text>
              </Flex>
            </Tooltip.Content>
          </Theme>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}

/** A nature suggestion: the place on a small map with the walk there, and how long to stay. */
function NatureCard({ item }: { item: Extract<Item, { kind: "nature" }> }) {
  const { place } = item;
  const remove = useDeleteBlock();
  const walk = walkMinutes(place);
  return (
    <Flex direction="column" gap="2">
      {place.from ? <CardMap from={place.from} place={place} /> : <Tree />}
      <Heading size="3">{place.name}</Heading>
      <When item={item} />
      <Text as="p" size="2" color="gray">
        {place.walk?.estimate ? "About " : ""}
        {walk} min walk each way, {place.stay} min there
      </Text>
      <Flex gap="2" mt="2" align="center" wrap="wrap">
        <Button asChild variant="soft">
          <a
            href={
              place.from ? directionsLink(place.from, place) : mapLink(place)
            }
            target="_blank"
            rel="noreferrer"
          >
            Directions
          </a>
        </Button>
        <AskInPlace
          question="Delete this?"
          yes="Delete"
          onYes={() => remove.mutate({ id: item.block.id })}
        >
          Delete
        </AskInPlace>
      </Flex>
    </Flex>
  );
}

/** An assignment on the day it's due; or, with `left`, work not planned yet. */
export function Due({
  task,
  tz,
  fill,
  left,
}: {
  task: TaskRow;
  tz: string;
  fill?: boolean;
  /** Minutes of its work not placed in the plan yet. */
  left?: number;
}) {
  const setDone = useSetTaskDone();
  const planner = usePlannerData();
  const courseColor = useCourseColor();
  const due = zoned(task.due, tz);
  return (
    <Popover.Root>
      <Popover.Trigger>
        <button
          type="button"
          className={`${styles.due} ${fill ? styles.fill : ""} ${task.done ? styles.done : ""} ${isReading(planner, task) ? styles.reading : ""}`}
          style={{ "--fill": courseColor(task.course) } as CSSProperties}
          data-kind={left === undefined ? "due" : "unplanned"}
        >
          <span className={styles.chip}>
            {task.title}
            {left === undefined ? "" : ` · ${duration(left)} left`}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Content width="340px" align="start" collisionPadding={12}>
        <Flex direction="column" gap="2">
          <Text size="1" color="gray">
            {task.course}
          </Text>
          <Heading size="3">{task.title}</Heading>
          <Text as="p" size="2" color="gray">
            Due {shortDate(due)}, {clock(due)}
            {task.minutes ? ` · about ${task.minutes} min` : ""}
          </Text>
          <TaskDetails task={task} />
          <Text as="label" size="2" mt="2">
            <Flex gap="2" align="center">
              <Checkbox
                checked={task.done}
                onCheckedChange={(checked) =>
                  setDone.mutate({ id: task.id, done: checked === true })
                }
              />
              Done
            </Flex>
          </Text>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
