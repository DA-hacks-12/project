import { createClient } from "@/lib/supabase/server";
import { atClock, zoned } from "@/lib/time";
import { SESSION } from "@/modules/arrange/core/plan";
import { sessionCovering } from "@/modules/extension/core/lockdown";

// What the extension asks every minute: is Lockdown on in Options, and which
// session (if any) is under way now. `?at=HH:MM` pins the clock for demos, in
// the student's time zone; `left` counts from that pinned moment.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return Response.json({ error: "signed out" }, { status: 401 });

  const { data: settings, error } = await supabase
    .from("settings")
    .select("lockdown, time_zone")
    .maybeSingle();
  if (error) return Response.json({ error: "settings" }, { status: 500 });
  if (!settings?.lockdown) return Response.json({ on: false, session: null });

  let now = Date.now();
  const at = new URL(request.url).searchParams.get("at");
  if (at) {
    const set = atClock(zoned(new Date(now), settings.time_zone), at);
    if (set) now = set.epochMilliseconds;
  }

  // A session under way started at most a longest session ago.
  const { data: sessions, error: sessionsError } = await supabase
    .from("blocks")
    .select("id, start, minutes, done, task_id")
    .eq("kind", "session")
    .eq("done", false)
    .gt("start", new Date(now - SESSION.max * 60_000).toISOString())
    .lte("start", new Date(now).toISOString());
  if (sessionsError)
    return Response.json({ error: "sessions" }, { status: 500 });
  const ids = [...new Set(sessions.flatMap((s) => s.task_id ?? []))];
  const { data: tasks, error: tasksError } = ids.length
    ? await supabase
        .from("tasks")
        .select("id, title, course, done")
        .in("id", ids)
    : { data: [], error: null };
  if (tasksError) return Response.json({ error: "tasks" }, { status: 500 });

  return Response.json({
    on: true,
    session: sessionCovering(sessions, tasks, now),
  });
}
