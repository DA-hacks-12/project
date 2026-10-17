"use client";

import { SpeakerLoudIcon, SpeakerOffIcon } from "@radix-ui/react-icons";
import { Button, Flex, Heading, IconButton, Text } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { askExtension } from "@/modules/extension/ui/bridge";
import {
  useCourseColor,
  useKeep,
  usePlannerData,
  useSetBlockDone,
} from "@/modules/planner/ui/planner";
import styles from "./focus.module.css";

// Focus mode: one session, full screen, in pomodoros of the student's lengths
// (Options → Focus). Time fills the screen from the ground up: the field
// behind the clock rises in the course's color while you work, and sinks
// back in green while you rest. The extension hears when focus runs; whether that blocks anything
// is its Lockdown setting's business.

// Lofi Girl's live stream, whichever is on now (a fixed video id goes stale).
const LOFI =
  "https://www.youtube.com/embed/live_stream?channel=UCSJ4gkVC6NrvII8umztf0Ow&autoplay=1";

interface Segment {
  kind: "focus" | "rest";
  minutes: number;
}

/** The session in pomodoros. A rest left over at the end is dropped. */
export function pomodoros(total: number, on: number, off: number): Segment[] {
  const segments: Segment[] = [];
  let left = total;
  while (left > 0) {
    const work = Math.min(on, left);
    segments.push({ kind: "focus", minutes: work });
    left -= work;
    if (left <= off) break;
    segments.push({ kind: "rest", minutes: off });
    left -= off;
  }
  return segments;
}

export function Focus({ id }: { id: string }) {
  const planner = usePlannerData();
  const router = useRouter();
  const keep = useKeep();
  const setDone = useSetBlockDone();
  const courseColor = useCourseColor();
  const block = planner.blocks.find((b) => b.id === id);
  const task = planner.tasks.find((t) => t.id === block?.task_id);
  const on = planner.settings?.focus_minutes ?? 25;
  const off = planner.settings?.break_minutes ?? 5;
  const segments = useMemo(
    () => pomodoros(block?.minutes ?? on, on, off),
    [block?.minutes, on, off],
  );
  const rounds = segments.filter((s) => s.kind === "focus").length;

  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(segments[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(false);
  const segment = segments[index];
  const length = segment.minutes * 60;
  const finished = !running && index === segments.length - 1 && left === 0;

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
      void askExtension({ type: "unfocus" });
    }
  }, [left, running, index, segments]);

  // The extension hears whenever focus runs, and when it stops.
  const tell = (running: boolean) => {
    if (!running) {
      void askExtension({ type: "unfocus" });
      return;
    }
    const rest = segments
      .slice(index + 1)
      .reduce((sum, s) => sum + s.minutes * 60, left);
    void askExtension({
      type: "focus",
      id: block?.id,
      seconds: rest,
      title: task?.title ?? "Focus",
      course: task?.course ?? null,
    });
  };
  // A fresh page isn't running yet (a reload resets the clock), and leaving
  // ends it.
  useEffect(() => {
    void askExtension({ type: "unfocus" });
    return () => void askExtension({ type: "unfocus" });
  }, []);

  const toggle = () => {
    if (finished) return;
    setRunning(!running);
    tell(!running);
  };
  const leave = () => {
    tell(false);
    router.push(`/day${keep}`);
  };

  // Space starts and pauses, as in any timer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.target !== document.body) return;
      event.preventDefault();
      document.getElementById("focus-toggle")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  // The tab title shows the time left. Next writes the page's own title again
  // once its streamed metadata lands, so the head is watched and ours restored.
  const title = `${mm}:${ss} · ${task?.title ?? "Focus"}`;
  useEffect(() => {
    const set = () => {
      if (document.title !== title) document.title = title;
    };
    set();
    const watch = new MutationObserver(set);
    watch.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      watch.disconnect();
      document.title = "Planner";
    };
  }, [title]);

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

  const elapsed = 1 - left / length;
  const round = segments
    .slice(0, index + 1)
    .filter((s) => s.kind === "focus").length;
  const label = finished
    ? "Finished"
    : segment.kind === "focus"
      ? `Focus ${round} of ${rounds}`
      : "Rest";

  return (
    <div
      className={`${styles.screen} ${running ? styles.running : ""}`}
      style={{ "--course": courseColor(task?.course) } as CSSProperties}
    >
      {/* Time, filling the screen. A new segment starts a new field. */}
      <div
        key={index}
        aria-hidden
        className={`${styles.field} ${segment.kind === "rest" ? styles.rest : ""}`}
        style={{
          transform: `scaleY(${segment.kind === "rest" ? 1 - elapsed : elapsed})`,
        }}
      />

      <header className={styles.top}>
        <div>
          <Text as="p" size="2" color="gray">
            {task?.course}
          </Text>
          <Heading size="6" className={styles.title}>
            {task?.title ?? "Focus"}
          </Heading>
        </div>
        <Button variant="ghost" color="gray" onClick={leave}>
          Leave
        </Button>
      </header>

      <div className={styles.center}>
        <div className={styles.clock} role="timer" aria-live="off">
          {mm}:{ss}
        </div>
        <Text size="3" color="gray">
          {label}
        </Text>
        <div className={styles.segments} aria-hidden>
          {segments.map((s, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are fixed for the session
              key={i}
              className={s.kind === "rest" ? styles.restSegment : undefined}
              style={{ flexGrow: s.minutes }}
            >
              <i
                style={{
                  transform: `scaleX(${i < index ? 1 : i === index ? elapsed : 0})`,
                }}
              />
            </span>
          ))}
        </div>
        <Flex gap="3" align="center">
          <Button
            id="focus-toggle"
            size="3"
            onClick={toggle}
            disabled={finished}
          >
            {running
              ? "Pause"
              : left === length && index === 0
                ? "Start"
                : "Resume"}
          </Button>
          <Button
            size="3"
            variant="soft"
            onClick={() => {
              // The extension asks again once Done is saved: the session is
              // no longer under way, so Lockdown lifts at once.
              setDone
                .mutateAsync({ id: block.id, done: true })
                .finally(() => void askExtension({ type: "sync" }));
              leave();
            }}
          >
            Done
          </Button>
          <IconButton
            size="3"
            variant="soft"
            aria-label={sound ? "Sound off" : "Sound on"}
            onClick={() => setSound(!sound)}
          >
            {sound ? <SpeakerLoudIcon /> : <SpeakerOffIcon />}
          </IconButton>
        </Flex>
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
    </div>
  );
}
