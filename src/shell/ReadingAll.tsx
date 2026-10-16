"use client";

import { isReading, READING_WINDOW_MS } from "@/modules/planner/core/items";
import { usePlannerData } from "@/modules/planner/ui/planner";
import { Reading } from "./Reading";

/** Every school's reading together, shown in the Day and Week headers while it runs. */
export function ReadingAll() {
  const planner = usePlannerData();
  const imported = planner.tasks.filter((t) => {
    const feed = planner.feeds.find((f) => f.id === t.feed_id);
    return (
      !!feed?.imported_at &&
      Date.now() - Date.parse(feed.imported_at) < READING_WINDOW_MS
    );
  });
  const reading = imported.filter((t) => isReading(planner, t)).length;
  if (!reading) return null;
  return <Reading done={imported.length - reading} total={imported.length} />;
}
