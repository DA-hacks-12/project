"use client";

import { useIsMutating } from "@tanstack/react-query";
import {
  isPlanning,
  isReading,
  READING_WINDOW_MS,
} from "@/modules/planner/core/items";
import { natureKey, usePlannerData } from "@/modules/planner/ui/planner";
import { Reading } from "./Reading";

/**
 * Every school's reading together, shown in the Day and Week headers while it
 * runs; then "Planning" while the work it brought is placed; and "Finding
 * walks" while places nearby are looked up and the walks planned.
 */
export function ReadingAll() {
  const planner = usePlannerData();
  const walks = useIsMutating({ mutationKey: natureKey }) > 0;
  const imported = planner.tasks.filter((t) => {
    const feed = planner.feeds.find((f) => f.id === t.feed_id);
    return (
      !!feed?.imported_at &&
      Date.now() - Date.parse(feed.imported_at) < READING_WINDOW_MS
    );
  });
  const reading = imported.filter((t) => isReading(planner, t)).length;
  if (!reading)
    return isPlanning(planner) ? (
      <Reading done={0} total={0} verb="Planning" />
    ) : walks ? (
      <Reading done={0} total={0} verb="Finding walks" />
    ) : null;
  return <Reading done={imported.length - reading} total={imported.length} />;
}
