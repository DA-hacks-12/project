"use client";

import { SpeakerLoudIcon, SpeakerOffIcon } from "@radix-ui/react-icons";
import {
  Button,
  Flex,
  Heading,
  IconButton,
  Switch,
  Text,
} from "@radix-ui/themes";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { iso } from "@/lib/time";
import { askExtension, useExtension } from "@/modules/extension/ui/bridge";
import {
  useNow,
  usePlannerData,
  useSetBlockDone,
} from "@/modules/planner/ui/planner";
import styles from "./focus.module.css";
import { Reminders } from "./Reminders";

// Focus mode: one session, full screen, in pomodoros (25 minutes on, 5 off).
// With the optional extension, Lockdown blocks entertainment sites while it runs.

const ON = 25;
const OFF = 5;
const LOFI = "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1";

interface Segment {
  kind: "Focus" | "Break";
  minutes: number;
}

export function pomodoros(total: number): Segment[] {
  const segments: Segment[] = [];
  let left = total;
  while (left > 0) {
    const on = Math.min(ON, left);
    segments.push({ kind: "Focus", minutes: on });
    left -= on;
    if (left > 0) {
      const off = Math.min(OFF, left);
      segments.push({ kind: "Break", minutes: off });
      left -= off;
    }
  }
  return segments;
}

export function Focus({ id }: { id: string }) {
  const planner = usePlannerData();
  const router = useRouter();
  const params = useSearchParams();
  const keep = params.toString() ? `?${params.toString()}` : "";
  const setDone = useSetBlockDone();
  const { now } = useNow();
  const block = planner.blocks.find((b) => b.id === id);
  const task = planner.tasks.find((t) => t.id === block?.task_id);
  const segments = pomodoros(block?.minutes ?? ON);
  const focusRounds = segments.filter((s) => s.kind === "Focus").length;

  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(segments[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(false);
  // Lockdown needs the optional extension; without it the switch isn't shown.
  const extension = useExtension();
  const [lockdown, setLockdown] = useState(true);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, [running]);

  useEffect(() => {
    if (left > 0 || !running) return;
    if (index + 1 < segments.length) {
      setIndex(index + 1);
      setLeft(segments[index + 1].minutes * 60);
    } else {
      setRunning(false);
    }
  }, [left, running, index, segments]);

  // Leaving focus mode always lifts the block.
  useEffect(() => () => void askExtension({ type: "unfocus" }), []);

  const lockUntilEnd = () => {
    const rest = segments
      .slice(index + 1)
      .reduce((sum, s) => sum + s.minutes * 60, left);
    void askExtension({
      type: "focus",
      until: iso(now.add({ seconds: rest })),
    });
  };
  const start = () => {
    setRunning(true);
    if (extension && lockdown) lockUntilEnd();
  };
  const leave = () => {
    void askExtension({ type: "unfocus" });
    router.push(`/day${keep}`);
  };

  if (!block) {
    return (
      <Flex
        className={styles.screen}
        direction="column"
        align="center"
        justify="center"
        gap="4"
      >
        <Text size="3">This session is gone.</Text>
        <Button variant="soft" onClick={leave}>
          Back
        </Button>
      </Flex>
    );
  }

  const segment = segments[index];
  const round = segments
    .slice(0, index + 1)
    .filter((s) => s.kind === "Focus").length;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <Flex
      className={styles.screen}
      direction="column"
      align="center"
      justify="center"
      gap="5"
    >
      <Flex direction="column" align="center" gap="1">
        <Text size="2" color="gray">
          {task?.course}
        </Text>
        <Heading size="7" align="center">
          {task?.title ?? "Focus"}
        </Heading>
      </Flex>
      <div className={styles.clock}>
        {mm}:{ss}
      </div>
      <Text size="3" color="gray">
        {segment.kind === "Focus"
          ? `Focus · ${round} of ${focusRounds}`
          : "Break"}
      </Text>
      <Flex gap="3" align="center">
        <Button size="3" onClick={running ? () => setRunning(false) : start}>
          {running ? "Pause" : "Start"}
        </Button>
        <IconButton
          size="3"
          variant="soft"
          aria-label={sound ? "Sound off" : "Sound on"}
          onClick={() => setSound(!sound)}
        >
          {sound ? <SpeakerLoudIcon /> : <SpeakerOffIcon />}
        </IconButton>
        <Button
          size="3"
          variant="soft"
          onClick={() => {
            setDone.mutate({ id: block.id, done: true });
            leave();
          }}
        >
          Done
        </Button>
        <Button size="3" variant="soft" color="gray" onClick={leave}>
          Leave
        </Button>
      </Flex>
      {extension && (
        <Text as="label" size="2">
          <Flex gap="2" align="center">
            <Switch
              checked={lockdown}
              onCheckedChange={(on) => {
                setLockdown(on);
                if (!running) return;
                if (on) lockUntilEnd();
                else void askExtension({ type: "unfocus" });
              }}
            />
            Lockdown
          </Flex>
        </Text>
      )}
      <div className={styles.notes}>
        <Reminders compact />
      </div>
      {sound && (
        <iframe
          className={styles.lofi}
          src={LOFI}
          title="Lofi"
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </Flex>
  );
}
