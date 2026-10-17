import type { createClient } from "@/lib/supabase/server";
import { isPlanning } from "@/modules/planner/core/items";
import type { Planner } from "@/modules/planner/core/queries";

// One automatic plan at a time per student. Taking the turn is one update that
// only succeeds while nobody holds it (or the holder is long gone), so two
// imports finishing together can't both plan around the same empty calendar.

type Client = Awaited<ReturnType<typeof createClient>>;

const STALE_MS = 4 * 60_000; // a plan that never let go
const WAIT_MS = 2000;
const GIVE_UP_MS = 5 * 60_000;

const PLANNED_WAIT_MS = 100_000;

/** Waits while an import's plan is still being made (up to 100 seconds). True if it waited. */
export async function untilPlanned(supabase: Client): Promise<boolean> {
  const planning = async () => {
    const { data: feeds } = await supabase
      .from("feeds")
      .select("imported_at, planned_at");
    return isPlanning({ feeds: feeds ?? [] } as unknown as Planner);
  };
  if (!(await planning())) return false;
  for (const until = Date.now() + PLANNED_WAIT_MS; Date.now() < until; ) {
    await new Promise((wait) => setTimeout(wait, WAIT_MS));
    if (!(await planning())) break;
  }
  return true;
}

export async function oneAtATime<T>(
  supabase: Client,
  run: () => Promise<T>,
): Promise<T> {
  const until = Date.now() + GIVE_UP_MS;
  for (;;) {
    const now = new Date();
    const stale = new Date(now.getTime() - STALE_MS).toISOString();
    const { data, error } = await supabase
      .from("settings")
      .update({ planning_since: now.toISOString() })
      .or(`planning_since.is.null,planning_since.lt.${stale}`)
      .select("owner_id");
    if (error) throw error;
    if (data?.length) break;
    if (Date.now() > until) throw new Error("planning: waited too long");
    await new Promise((wait) => setTimeout(wait, WAIT_MS));
  }
  try {
    return await run();
  } finally {
    await supabase
      .from("settings")
      .update({ planning_since: null })
      .not("owner_id", "is", null);
  }
}
