import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { importFeed, readAssignments } from "@/modules/import/core/run";

// The tasks are saved and the answer goes back at once; the model reads the
// new ones afterwards, and the page shows them filling in.
export const maxDuration = 120;

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
