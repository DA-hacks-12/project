"use client";

import {
  Button,
  Checkbox,
  Flex,
  Heading,
  Link,
  Popover,
  Text,
} from "@radix-ui/themes";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, useState } from "react";
import { clock, shortDate, zoned } from "@/lib/time";
import { type Item, isReading, titleOf } from "@/modules/planner/core/items";
import type { TaskRow } from "@/modules/planner/core/queries";
import {
  useDeleteBlock,
  usePlannerData,
  useRescheduleAround,
  useSetBlockDone,
  useSetTaskDone,
  useUpdateEvent,
} from "@/modules/planner/ui/planner";
import { mapLink } from "@/modules/suggest/core/places";
import { AskInPlace } from "./AskInPlace";
import styles from "./block.module.css";
import { EventForm, useDraftGuard } from "./EventForm";
import { RescheduleForm } from "./RescheduleForm";
import { Tree } from "./Tree";

const KIND_CLASS: Record<Item["kind"], string> = {
  session: styles.light,
  break: styles.break,
  event: styles.event,
  idea: styles.idea,
};

/** Any block on the calendar. Clicking it opens its card in place. */
export function Block({
  item,
  compact,
  style,
}: {
  item: Item;
  compact?: boolean;
  style?: CSSProperties;
}) {
  const guard = useDraftGuard();
  const kind =
    item.kind === "session" && item.task?.work === "deep"
      ? styles.deep
      : KIND_CLASS[item.kind];
  const done =
    (item.kind === "session" && item.block.done) ||
    (item.kind === "session" && item.task?.done);
  return (
    <Popover.Root>
      <Popover.Trigger>
        <button
          type="button"
          className={`${styles.block} ${kind} ${done ? styles.done : ""} ${compact ? styles.compact : ""}`}
          style={style}
          data-kind={item.kind}
        >
          {/* Short blocks in the week grid show what before when. */}
          {compact && <span className={styles.title}>{titleOf(item)}</span>}
          <span className={styles.time}>
            {clock(item.start)}–{clock(item.end)}
          </span>
          {!compact && <span className={styles.title}>{titleOf(item)}</span>}
          {item.kind === "session" && !compact && (
            <span className={styles.sub}>{item.task?.course}</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Content
        width="340px"
        align="start"
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
    case "idea":
      return <IdeaCard item={item} />;
  }
}

function When({ item, extra }: { item: Item; extra?: string }) {
  return (
    <Text as="p" size="2" color="gray">
      {clock(item.start)}–{clock(item.end)}
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

function IdeaCard({ item }: { item: Extract<Item, { kind: "idea" }> }) {
  const { place } = item.idea;
  return (
    <Flex direction="column" gap="2">
      <Tree />
      <Heading size="3">{item.idea.words}</Heading>
      <When item={item} extra={`${item.idea.minutes} minutes`} />
      {place && (
        <Flex gap="3" align="center">
          <Text size="2" color="gray">
            {place.km} km away
          </Text>
          <Link href={mapLink(place)} target="_blank" rel="noreferrer" size="2">
            Open map
          </Link>
        </Flex>
      )}
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
  const due = zoned(task.due, tz);
  return (
    <Popover.Root>
      <Popover.Trigger>
        <button
          type="button"
          className={`${styles.due} ${fill ? styles.fill : ""} ${task.done ? styles.done : ""} ${isReading(planner, task) ? styles.reading : ""}`}
          data-kind="due"
        >
          <span className={styles.title}>{task.title}</span>
        </button>
      </Popover.Trigger>
      <Popover.Content width="340px" align="start">
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
