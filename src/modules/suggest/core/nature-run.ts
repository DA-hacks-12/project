import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { addMinutes, iso, type Zoned, zoned } from "@/lib/time";
import type { Window } from "@/modules/arrange/core/plan";
import type { NatureDay } from "./nature";
import { pickNature } from "./nature-pick";
import type { Place } from "./places";

// Nature suggestions are planned again on the days that changed: the old ones
// there (not yet started) go, and Sonnet picks anew around the plan as it now
// stands. Everything runs as the student under RLS.

type Client = SupabaseClient<Database>;

/** What Undo needs to put a replaced nature suggestion back. */
export interface NatureRestore {
  start: string;
  minutes: number;
  title: string;
  place: Json;
}

export async function refreshNature(
  supabase: Client,
  input: { now: Zoned; hours: number[]; days: Window[]; which: number[] },
): Promise<{ added: string[]; removed: NatureRestore[] }> {
  const { now, hours, days } = input;
  const which = [...new Set(input.which)].filter((d) => days[d]).sort();
  const none = { added: [], removed: [] };
  if (!which.length) return none;

  const [settings, blocksResult] = await Promise.all([
    supabase.from("settings").select("places").maybeSingle(),
    supabase.from("blocks").select("id, kind, start, minutes, title, place"),
  ]);
  if (blocksResult.error) throw blocksResult.error;
  const tz = now.timeZoneId;
  const blocks = (blocksResult.data ?? []).map((b) => {
    const start = zoned(b.start, tz);
    return { ...b, at: start, end: addMinutes(start, b.minutes) };
  });
  const within = (at: Zoned, w: Window) =>
    at.epochMilliseconds >= w.start.epochMilliseconds &&
    at.epochMilliseconds < w.end.epochMilliseconds;
  const overlaps = (b: { at: Zoned; end: Zoned }, w: Window) =>
    b.at.epochMilliseconds < w.end.epochMilliseconds &&
    b.end.epochMilliseconds > w.start.epochMilliseconds;

  // The ones that haven't started yet on these days go.
  const old = blocks.filter(
    (b) =>
      b.kind === "nature" &&
      b.at.epochMilliseconds >= now.epochMilliseconds &&
      which.some((d) => within(b.at, days[d])),
  );
  if (old.length) {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .in(
        "id",
        old.map((b) => b.id),
      );
    if (error) throw error;
  }
  const removed = old.map((b) => ({
    start: b.start,
    minutes: b.minutes,
    title: b.title ?? "Outside",
    place: b.place ?? {},
  }));

  const places = savedPlaces(settings.data?.places);
  if (!places.length) return { added: [], removed };

  // One a day: a day that already has one that started (it stays) gets no more.
  const started = blocks.filter(
    (b) => b.kind === "nature" && !old.some((o) => o.id === b.id),
  );
  const open = which.filter(
    (d) =>
      !started.some((b) =>
        b.at.toPlainDate().equals(days[d].start.toPlainDate()),
      ),
  );
  if (!open.length) return { added: [], removed };

  const natureDays: NatureDay[] = open.map((d) => {
    const busy = blocks.filter(
      (b) => b.kind !== "nature" && overlaps(b, days[d]),
    );
    return {
      day: d,
      window: days[d],
      busy: busy.map((b) => ({ start: b.at, end: b.end })),
      work: busy
        .filter((b) => b.kind === "session")
        .reduce((sum, b) => sum + b.minutes, 0),
    };
  });
  const outings = await pickNature({ now, hours, places, days: natureDays });
  if (!outings.length) return { added: [], removed };

  const { data, error } = await supabase
    .from("blocks")
    .insert(
      outings.map((o) => ({
        kind: "nature",
        start: iso(o.start),
        minutes: o.minutes,
        title: o.place.name.slice(0, 120),
        place: JSON.parse(JSON.stringify({ ...o.place, stay: o.stay })),
      })),
    )
    .select("id");
  if (error) throw error;
  return { added: (data ?? []).map((b) => b.id), removed };
}

/** The saved places, keeping only well-formed ones. */
function savedPlaces(saved: unknown): Place[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (p): p is Place =>
      typeof p?.name === "string" &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Number.isFinite(p.km),
  );
}
