"use client";

import {
  Button,
  Checkbox,
  Flex,
  Heading,
  HoverCard,
  Link,
  Popover,
  Text,
} from "@radix-ui/themes";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, useState } from "react";
import { clock, clockRange, shortDate, zoned } from "@/lib/time";
import { type Item, isReading, titleOf } from "@/modules/planner/core/items";
import type { TaskRow } from "@/modules/planner/core/queries";
import {
  useCourseColor,
  useDeleteBlock,
  usePlannerData,
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
import mapStyles from "./nature-map.module.css";
import { RescheduleForm } from "./RescheduleForm";
import { Tree } from "./Tree";

// Leaflet needs the browser: the map loads client-only, in a space its size.
const NatureMap = dynamic(() => import("./NatureMap"), {
  ssr: false,
  loading: () => <div className={mapStyles.space} />,
});

const KIND_CLASS: Record<Item["kind"], string> = {
  session: styles.session,
  break: styles.break,
  event: styles.event,
  nature: styles.nature,
};

/** Any block on the calendar, in one solid color. Clicking it opens its card in place. */
export function Block({
  item,
  compact,
  narrow,
}: {
  item: Item;
  /** In the week grid: one line of title, then the time. */
  compact?: boolean;
  /** Too slim for a time range: just when it starts. */
  narrow?: boolean;
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
        <BlockCard item={item} guard={guard} />
      </Popover.Content>
    </Popover.Root>
  );
}

function BlockCard({
  item,
  guard,
}: {
  item: Item;
  guard: ReturnType<typeof useDraftGuard>;
}) {
  switch (item.kind) {
    case "session":
      return <SessionCard item={item} />;
    case "event":
      return <EventCard item={item} guard={guard} />;
    case "break":
      return <BreakCard item={item} />;
    case "nature":
      return <NatureCard item={item} />;
  }
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

function SessionCard({ item }: { item: Extract<Item, { kind: "session" }> }) {
  const [rescheduling, setRescheduling] = useState(false);
  const setDone = useSetBlockDone();
  const params = useSearchParams();
  const keep = params.toString() ? `?${params.toString()}` : "";
  const task = item.task;

  // Rescheduling from a session: that session moves (and its task waits an
  // hour), plus whatever the scope opens up.
  if (rescheduling)
    return <RescheduleForm dismiss={item.block.id} defaultScope="hour" />;

  return (
    <Flex direction="column" gap="2">
      <Text size="1" color="gray">
        {task?.course}
      </Text>
      <Heading size="3">{task?.title ?? "Session"}</Heading>
      <When item={item} extra={task?.work ?? undefined} />
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
  const around = useRescheduleAround();
  const remove = useDeleteBlock();
  if (editing) {
    return (
      <EventForm
        guard={guard}
        initial={item.block}
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
 * Pointing at a nature suggestion previews it: the map with the walking route,
 * and the place's name under it. After Altay's map location preview (his map
 * test on the mapIntegration branch), with the walk measured on foot.
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
  const [hover, setHover] = useState(false);
  if (!place.from) return children;
  return (
    <HoverCard.Root open={hover && !hidden} onOpenChange={setHover}>
      <HoverCard.Trigger>{children}</HoverCard.Trigger>
      <HoverCard.Content
        width="360px"
        size="1"
        className={styles.preview}
        side="top"
        align="start"
      >
        <NatureMap from={place.from} place={place} tall />
        <Text as="p" size="2" weight="medium" className={styles.previewLabel}>
          {place.name}
        </Text>
      </HoverCard.Content>
    </HoverCard.Root>
  );
}

/** A nature suggestion: the place on a small map with the walk there, and how long to stay. */
function NatureCard({ item }: { item: Extract<Item, { kind: "nature" }> }) {
  const { place } = item;
  const remove = useDeleteBlock();
  const walk = walkMinutes(place);
  return (
    <Flex direction="column" gap="2">
      {place.from ? <NatureMap from={place.from} place={place} /> : <Tree />}
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

/** An assignment on the day it's due. */
export function Due({
  task,
  tz,
  fill,
}: {
  task: TaskRow;
  tz: string;
  fill?: boolean;
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
          data-kind="due"
        >
          <span className={styles.chip}>{task.title}</span>
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
