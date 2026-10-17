import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/database.types";
import type { Clock, Night } from "@/modules/arrange/core/body-clock";
import type { Place } from "@/modules/suggest/core/places";

// Everything a screen needs, loaded once and kept in the query cache. Plain
// writes go straight to Supabase as the signed-in student; RLS keeps them theirs.

export type Db = SupabaseClient<Database>;
export type TaskRow = Tables<"tasks">;
export type BlockRow = Tables<"blocks">;
export type Settings = Tables<"settings">;
export type Feed = Tables<"feeds">;
export type DayLimit = Tables<"day_limits">;

export interface Planner {
  email: string | null;
  settings: Settings | null;
  feeds: Feed[];
  tasks: TaskRow[];
  blocks: BlockRow[];
  limits: DayLimit[];
}

export async function fetchPlanner(db: Db): Promise<Planner> {
  const [user, settings, feeds, tasks, blocks, limits] = await Promise.all([
    db.auth.getUser(),
    db.from("settings").select("*").maybeSingle(),
    db.from("feeds").select("*").order("name"),
    db.from("tasks").select("*").order("due"),
    db.from("blocks").select("*").order("start"),
    db.from("day_limits").select("*").order("day"),
  ]);
  for (const result of [settings, feeds, tasks, blocks, limits])
    if (result.error) throw result.error;
  return {
    email: user.data.user?.email ?? null,
    settings: settings.data,
    feeds: feeds.data ?? [],
    tasks: tasks.data ?? [],
    blocks: blocks.data ?? [],
    limits: limits.data ?? [],
  };
}

export function placesOf(settings: Settings | null): Place[] {
  const places = settings?.places;
  return Array.isArray(places) ? (places as unknown as Place[]) : [];
}

const check = (error: unknown) => {
  if (error) throw error;
};

/** Removing a school removes its tasks, and with them their sessions. */
export async function deleteFeed(db: Db, id: string) {
  check((await db.from("feeds").delete().eq("id", id)).error);
}

/** A lighter day, removed: that day carries a normal load again at the next reschedule. */
export async function deleteLimit(db: Db, id: string) {
  check((await db.from("day_limits").delete().eq("id", id)).error);
}

export async function setTaskDone(db: Db, id: string, done: boolean) {
  check((await db.from("tasks").update({ done }).eq("id", id)).error);
}

export async function setBlockDone(db: Db, id: string, done: boolean) {
  check((await db.from("blocks").update({ done }).eq("id", id)).error);
}

export interface EventDraft {
  title: string;
  details: string | null;
  start: string; // ISO
  minutes: number;
}

export async function addEvent(db: Db, id: string, draft: EventDraft) {
  check(
    (await db.from("blocks").insert({ id, kind: "event", ...draft })).error,
  );
}

export async function updateEvent(db: Db, id: string, draft: EventDraft) {
  check((await db.from("blocks").update(draft).eq("id", id)).error);
}

export async function deleteBlock(db: Db, id: string) {
  check((await db.from("blocks").delete().eq("id", id)).error);
}

export async function savePreferences(
  db: Db,
  preferences: Record<string, string>,
) {
  check(
    (
      await db
        .from("settings")
        .upsert({ preferences, updated_at: new Date().toISOString() })
    ).error,
  );
}

/** What the extension learned: active hours and nights. */
export async function saveActivity(
  db: Db,
  activity: { hours: number[]; nights: Night[] },
) {
  check(
    (
      await db.from("settings").upsert({
        active_hours: activity.hours,
        nights: JSON.parse(JSON.stringify(activity.nights)),
        updated_at: new Date().toISOString(),
      })
    ).error,
  );
}

/** Focus settings: Lockdown and the pomodoro's lengths. */
export type FocusSettings = Partial<
  Pick<Settings, "lockdown" | "focus_minutes" | "break_minutes">
>;

export async function saveFocusSettings(db: Db, patch: FocusSettings) {
  check(
    (
      await db
        .from("settings")
        .upsert({ ...patch, updated_at: new Date().toISOString() })
    ).error,
  );
}

export async function saveClock(db: Db, clock: Clock | null) {
  check(
    (
      await db
        .from("settings")
        .upsert({ clock, updated_at: new Date().toISOString() })
    ).error,
  );
}
