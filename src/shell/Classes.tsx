"use client";

import { Button, Flex, Text } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { clockRange } from "@/lib/time";
import { daysText } from "@/modules/classes/core/classes";
import { timeZoneOf } from "@/modules/planner/core/items";
import {
  useDeleteClass,
  useNow,
  usePlannerData,
  useReadSchedule,
  useWalks,
} from "@/modules/planner/ui/planner";
import { AskInPlace } from "./AskInPlace";
import { Reading } from "./Reading";

const KINDS = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

/** The file's contents as base64, without the data: prefix. */
function base64Of(file: File): Promise<string> {
  return new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Classes, in Options: one row per weekly meeting, read from the class
 * schedule the student uploads (a screenshot or PDF from their school's
 * portal). Each upload adds the classes not there yet (one per school);
 * Remove takes one away. The plan keeps clear of them.
 */
export function Classes() {
  const planner = usePlannerData();
  const { at } = useNow();
  const tz = timeZoneOf(planner);
  const read = useReadSchedule();
  const remove = useDeleteClass();
  const walks = useWalks();
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const today = Temporal.Now.plainDateISO(tz);

  const upload = async (chosen: File) => {
    setError(null);
    if (!KINDS.includes(chosen.type))
      return setError("Upload a screenshot (PNG or JPEG) or a PDF.");
    if (chosen.size > 3 * 1024 * 1024)
      return setError("That file is over 3 MB. A screenshot is smaller.");
    read
      .mutateAsync({ mediaType: chosen.type, data: await base64Of(chosen), at })
      .then((result) => walks(result.walkDays))
      .catch((e: unknown) =>
        setError(
          e instanceof Error && e.message !== "Signed out"
            ? e.message
            : "Couldn't read that schedule. Try again.",
        ),
      );
  };

  return (
    <Flex direction="column" gap="3">
      {planner.classes.map((c) => {
        const start = today.toZonedDateTime({
          timeZone: tz,
          plainTime: Temporal.PlainTime.from(c.start),
        });
        return (
          <Flex key={c.id} justify="between" align="center" gap="3">
            <Flex direction="column">
              <Text size="2" weight="medium">
                {c.title}
              </Text>
              <Text size="1" color="gray">
                {daysText(c.days)} ·{" "}
                {clockRange(start, start.add({ minutes: c.minutes }))}
                {c.place ? ` · ${c.place}` : ""}
              </Text>
            </Flex>
            <AskInPlace
              question="Remove this class?"
              yes="Remove"
              onYes={() => remove.mutate({ id: c.id })}
            >
              Remove
            </AskInPlace>
          </Flex>
        );
      })}
      {read.isPending && <Reading done={0} total={0} />}
      <Flex>
        <Button
          variant="soft"
          loading={read.isPending}
          onClick={() => file.current?.click()}
        >
          Upload
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          hidden
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen) void upload(chosen);
          }}
        />
      </Flex>
      {read.isSuccess && (
        <Text size="2" color="gray">
          {read.data.classes
            ? `${read.data.classes} ${read.data.classes === 1 ? "class" : "classes"} added`
            : "No new classes"}
          {read.data.moved
            ? ` · ${read.data.moved} ${read.data.moved === 1 ? "session" : "sessions"} moved`
            : ""}
        </Text>
      )}
      {error && (
        <Text size="2" color="red" role="alert">
          {error}
        </Text>
      )}
    </Flex>
  );
}
