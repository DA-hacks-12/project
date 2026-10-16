import "server-only";
import { createHash } from "node:crypto";
import pLimit from "p-limit";
import type { createClient } from "@/lib/supabase/server";
import { type Assignment, parseFeed, schoolOf } from "./feed";
import { interpret } from "./interpret";

// Import: a Canvas feed link or an uploaded .ics → read → saved at once as
// tasks under their school → new or changed ones go to Claude in the background. A due-date
// change alone (an extension) never costs a model call.

type Client = Awaited<ReturnType<typeof createClient>>;

export type Source =
  | { kind: "link"; url: string }
  | { kind: "file"; name: string; ics: string };

// Model calls in flight at once: a steady pool, so one slow answer never holds
// up the rest.
const CONCURRENCY = 32;

export function fingerprint(
  a: Pick<Assignment, "course" | "title" | "text">,
): string {
  return createHash("sha256")
    .update(`${a.course}\n${a.title}\n${a.text}`)
    .digest("hex")
    .slice(0, 16);
}

async function calendarText(source: Source): Promise<string> {
  if (source.kind === "file") return source.ics;
  const url = source.url.replace(/^webcal:\/\//, "https://");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`The feed answered ${response.status}`);
  return response.text();
}

export async function importFeed(
  supabase: Client,
  source: Source,
  tz: string,
  now: Date,
) {
  const assignments = parseFeed(await calendarText(source), tz, now);
  const school =
    schoolOf(assignments) ??
    (source.kind === "link" ? new URL(source.url).host : source.name);

  const { error: settingsError } = await supabase
    .from("settings")
    .upsert({ time_zone: tz, updated_at: now.toISOString() });
  if (settingsError) throw settingsError;

  // One feed per school: a link keeps its address, a file updates the same school.
  const { data: feed, error: feedError } = await supabase
    .from("feeds")
    .upsert(
      {
        name: school,
        imported_at: now.toISOString(),
        ...(source.kind === "link" ? { url: source.url } : {}),
      },
      { onConflict: "owner_id,name" },
    )
    .select("id")
    .single();
  if (feedError) throw feedError;

  const { data: saved, error } = await supabase
    .from("tasks")
    .select("uid, fingerprint, read")
    .eq("feed_id", feed.id);
  if (error) throw error;
  const known = new Map(saved.map((t) => [t.uid, t]));

  const rows = assignments.map((a) => ({ a, print: fingerprint(a) }));
  const fresh = rows.filter(({ a, print }) => {
    const task = known.get(a.uid);
    return !task || task.fingerprint !== print || !task.read;
  });

  // Title, due date and link always follow the feed; the interpretation only
  // counts while the text it was read from is unchanged.
  const { error: upsertError } = await supabase.from("tasks").upsert(
    rows.map(({ a, print }) => ({
      feed_id: feed.id,
      uid: a.uid,
      title: a.title,
      course: a.course,
      due: a.due,
      url: a.url,
      fingerprint: print,
      read:
        known.get(a.uid)?.fingerprint === print &&
        known.get(a.uid)?.read === true,
    })),
    { onConflict: "owner_id,feed_id,uid" },
  );
  if (upsertError) throw upsertError;

  return {
    school,
    feedId: feed.id,
    upcoming: assignments.length,
    reading: fresh.map(({ a }) => a),
  };
}

/**
 * The model reads each new or changed assignment, and each reading is saved
 * the moment it's ready, so the page can show them arriving one by one.
 * Runs after the import has answered (see the route). Returns how many held.
 */
export async function readAssignments(
  supabase: Client,
  feedId: string,
  assignments: Assignment[],
): Promise<number> {
  const limit = pLimit(CONCURRENCY);
  const done = await Promise.all(
    assignments.map((a) =>
      limit(async () => {
        const found = await interpret(a);
        if (!found) return false;
        const { error } = await supabase
          .from("tasks")
          .update({ ...found, read: true })
          .eq("feed_id", feedId)
          .eq("uid", a.uid);
        if (error) throw error;
        return true;
      }),
    ),
  );
  return done.filter(Boolean).length;
}
