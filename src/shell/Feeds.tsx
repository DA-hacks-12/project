"use client";

import { Button, Flex, Text, TextField } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { isReading } from "@/modules/planner/core/items";
import {
  type ImportSource,
  useDeleteFeed,
  useImportFeed,
  usePlannerData,
} from "@/modules/planner/ui/planner";
import { AskInPlace } from "./AskInPlace";
import { Reading } from "./Reading";

/**
 * Canvas, one school per row. Add a feed link (Canvas → Calendar → Calendar
 * Feed) or upload a saved .ics; a file from a linked school updates that school.
 */
export function Feeds() {
  const planner = usePlannerData();
  const importFeed = useImportFeed();
  const remove = useDeleteFeed();
  const [url, setUrl] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const running = importFeed.isPending ? importFeed.variables.source : null;

  const run = (source: ImportSource) =>
    importFeed.mutate({
      source,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

  return (
    <Flex direction="column" gap="3">
      {planner.feeds.map((feed) => {
        const tasks = planner.tasks.filter((t) => t.feed_id === feed.id);
        const count = tasks.length;
        const reading = tasks.filter((t) => isReading(planner, t)).length;
        return (
          <Flex key={feed.id} justify="between" align="center" gap="3">
            <Flex direction="column">
              <Text size="2" weight="medium">
                {feed.name}
              </Text>
              <Text size="1" color="gray">
                {reading
                  ? `Reading ${count - reading} of ${count}`
                  : `${count} assignments · ${feed.url ? "link" : "file"}`}
              </Text>
              {reading > 0 && (
                <Reading done={count - reading} total={count} label={false} />
              )}
            </Flex>
            <Flex gap="2" align="center">
              {feed.url && (
                <Button
                  variant="soft"
                  loading={running?.kind === "link" && running.url === feed.url}
                  disabled={importFeed.isPending}
                  onClick={() =>
                    feed.url && run({ kind: "link", url: feed.url })
                  }
                >
                  Import
                </Button>
              )}
              <AskInPlace
                question="Remove this school?"
                yes="Remove"
                onYes={() => remove.mutate({ id: feed.id })}
              >
                Remove
              </AskInPlace>
            </Flex>
          </Flex>
        );
      })}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const link = url.trim();
          if (!link) return;
          run({ kind: "link", url: link });
          setUrl("");
        }}
      >
        <Flex gap="2">
          <TextField.Root
            aria-label="Canvas feed link"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            type="submit"
            disabled={!url.trim() || importFeed.isPending}
            loading={
              running?.kind === "link" &&
              !planner.feeds.some((f) => f.url === running.url)
            }
          >
            Add
          </Button>
          <Button
            type="button"
            variant="soft"
            disabled={importFeed.isPending}
            loading={running?.kind === "file"}
            onClick={() => file.current?.click()}
          >
            Upload
          </Button>
          <input
            ref={file}
            type="file"
            accept=".ics,text/calendar"
            hidden
            onChange={async (event) => {
              const chosen = event.target.files?.[0];
              event.target.value = "";
              if (chosen)
                run({
                  kind: "file",
                  name: chosen.name,
                  ics: await chosen.text(),
                });
            }}
          />
        </Flex>
      </form>

      {importFeed.isSuccess && (
        <Text size="2" color="gray">
          {importFeed.data.school} · {importFeed.data.upcoming} upcoming
        </Text>
      )}
      {importFeed.isError && (
        <Text size="2" color="red">
          {importFeed.error.message}
        </Text>
      )}
    </Flex>
  );
}
