import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { addMinutes, iso, type Zoned, zoned } from "@/lib/time";
import type { Window } from "@/modules/arrange/core/plan";
import { classTimes } from "@/modules/classes/core/classes";
import type { NatureDay } from "./nature";
import { pickNature } from "./nature-pick";
import type { Place } from "./places";

// Nature suggestions are planned again on the days that changed: the old ones
// there (not yet started) go, and Sonnet picks anew around the plan as it now
// stands. A reschedule only clears them (`clearNature`) and answers; the page
// then asks for new ones (`/api/nature`), so no plan waits on a walk.
// Everything runs as the student under RLS.

type Client = SupabaseClient<Database>;

/** What Undo needs to put a replaced nature suggestion back. */
export interface NatureRestore {
  start: string;
  minutes: number;
  title: string;
  place: Json;
}

const within = (at: Zoned, w: Window) =>
  at.epochMilliseconds >= w.start.epochMilliseconds &&
  at.epochMilliseconds < w.end.epochMilliseconds;

/** The walks on these days that haven't started go; what Undo needs to put them back. */
export async function clearNature(
  supabase: Client,
  input: { now: Zoned; days: Window[]; which: number[] },
): Promise<NatureRestore[]> {
  const { now, days, which } = input;
  const { data, error } = await supabase
    .from("blocks")
    .select("id, start, minutes, title, place")
    .eq("kind", "nature")
    .gte("start", iso(now));
  if (error) throw error;
  const old = (data ?? []).filter((b) =>
    which.some(
      (d) => days[d] && within(zoned(b.start, now.timeZoneId), days[d]),
    ),
  );
  if (old.length) {
    const { error: deleteError } = await supabase
      .from("blocks")
      .delete()
      .in(
        "id",
        old.map((b) => b.id),
      );
    if (deleteError) throw deleteError;
  }
  return old.map((b) => ({
    start: b.start,
    minutes: b.minutes,
    title: b.title ?? "Outside",
    place: b.place ?? {},
  }));
}

export async function refreshNature(
  supabase: Client,
  input: { now: Zoned; hours: number[]; days: Window[]; which: number[] },
): Promise<{ added: string[]; removed: NatureRestore[] }> {
  const { now, hours, days } = input;
  const which = [...new Set(input.which)].filter((d) => days[d]).sort();
  const none = { added: [], removed: [] };
  if (!which.length) return none;

  // The ones that haven't started yet on these days go.
  const removed = await clearNature(supabase, { now, days, which });
  const [settings, blocksResult, classRows] = await Promise.all([
    supabase.from("settings").select("places").maybeSingle(),
    supabase.from("blocks").select("id, kind, start, minutes, title, place"),
    supabase
      .from("classes")
      .select("id, title, days, start, minutes, place, starts_on, ends_on"),
  ]);
  if (blocksResult.error) throw blocksResult.error;
  if (classRows.error) throw classRows.error;
  // Classes are busy for a walk like any other plan.
  const classes = classTimes(
    classRows.data ?? [],
    days[0].start,
    days[days.length - 1].end,
  ).map((c) => ({ at: c.start, end: c.end }));
  const tz = now.timeZoneId;
  const blocks = (blocksResult.data ?? []).map((b) => {
    const start = zoned(b.start, tz);
    return { ...b, at: start, end: addMinutes(start, b.minutes) };
  });
  const overlaps = (b: { at: Zoned; end: Zoned }, w: Window) =>
    b.at.epochMilliseconds < w.end.epochMilliseconds &&
    b.end.epochMilliseconds > w.start.epochMilliseconds;

  const places = savedPlaces(settings.data?.places);
  if (!places.length) return { added: [], removed };

  // One a day: a day that already has one (started, so it stays) gets no more.
  const started = blocks.filter((b) => b.kind === "nature");
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
      busy: [...busy, ...classes.filter((c) => overlaps(c, days[d]))].map(
        (b) => ({ start: b.at, end: b.end }),
      ),
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
