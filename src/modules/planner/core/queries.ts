import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/database.types";
import type { Place } from "@/modules/suggest/core/places";

// Everything a screen needs, loaded once and kept in the query cache. Plain
// writes go straight to Supabase as the signed-in student; RLS keeps them theirs.

export type Db = SupabaseClient<Database>;
export type TaskRow = Tables<"tasks">;
export type BlockRow = Tables<"blocks">;
export type Reminder = Tables<"reminders">;
export type Settings = Tables<"settings">;
export type Feed = Tables<"feeds">;
export type DayLimit = Tables<"day_limits">;

export interface Planner {
  email: string | null;
  settings: Settings | null;
  feeds: Feed[];
  tasks: TaskRow[];
  blocks: BlockRow[];
  reminders: Reminder[];
  limits: DayLimit[];
}

export async function fetchPlanner(db: Db): Promise<Planner> {
  const [user, settings, feeds, tasks, blocks, reminders, limits] =
    await Promise.all([
      db.auth.getUser(),
      db.from("settings").select("*").maybeSingle(),
      db.from("feeds").select("*").order("name"),
      db.from("tasks").select("*").order("due"),
      db.from("blocks").select("*").order("start"),
      db.from("reminders").select("*").order("created_at"),
      db.from("day_limits").select("*").order("day"),
    ]);
  for (const result of [settings, feeds, tasks, blocks, reminders, limits])
    if (result.error) throw result.error;
  return {
    email: user.data.user?.email ?? null,
    settings: settings.data,
    feeds: feeds.data ?? [],
    tasks: tasks.data ?? [],
    blocks: blocks.data ?? [],
    reminders: reminders.data ?? [],
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

export async function addReminder(db: Db, id: string, text: string) {
  check((await db.from("reminders").insert({ id, text })).error);
}

export async function setReminderDone(db: Db, id: string, done: boolean) {
  check((await db.from("reminders").update({ done }).eq("id", id)).error);
}

export async function saveActiveHours(db: Db, hours: number[]) {
  check(
    (
      await db
        .from("settings")
        .upsert({ active_hours: hours, updated_at: new Date().toISOString() })
    ).error,
  );
}
