import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reschedule } from "@/modules/arrange/core/arrange";
import { oneAtATime } from "@/modules/arrange/core/lock";
import { fillWeekSoFar } from "@/modules/arrange/core/week-so-far";
import { importFeed, readAssignments } from "@/modules/import/core/run";

// The tasks are saved and the answer goes back at once; the model reads the
// new ones afterwards, and the page shows them filling in. Then the work not
// planned yet gets placed (Reschedule's "fill").
export const maxDuration = 300;

const Body = z.object({
  timeZone: z.string().min(1).max(64),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("link"), url: z.url().max(500) }),
    z.object({
      kind: z.literal("file"),
      name: z.string().min(1).max(200),
      ics: z.string().min(1).max(5_000_000),
    }),
  ]),
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad request" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return Response.json({ error: "signed out" }, { status: 401 });
  try {
    const imported = await importFeed(
      supabase,
      body.data.source,
      body.data.timeZone,
      new Date(),
    );
    after(async () => {
      const reader = await createClient();
      const read = await readAssignments(
        reader,
        imported.feedId,
        imported.reading,
      );
      if (read < imported.reading.length) {
        console.error(`import: ${imported.reading.length - read} left unread`);
      }
      // New or changed work plans itself: only what isn't planned yet is
      // placed, and every session already planned stays. A mock school's
      // week so far is laid in first. Then the page, which checks back while
      // this runs, can stop.
      try {
        await oneAtATime(reader, async () => {
          await fillWeekSoFar(reader, new Date()).catch((error) =>
            console.error("import: week so far", error),
          );
          return reschedule(reader, new Date(), { scope: { kind: "fill" } });
        });
      } catch (error) {
        console.error("import: planning", error);
      }
      await reader
        .from("feeds")
        .update({ planned_at: new Date().toISOString() })
        .eq("id", imported.feedId);
    });
    return Response.json({
      school: imported.school,
      upcoming: imported.upcoming,
      reading: imported.reading.length,
    });
  } catch (error) {
    console.error("import", error);
    return Response.json(
      { error: "Couldn't read that calendar." },
      { status: 502 },
    );
  }
}
