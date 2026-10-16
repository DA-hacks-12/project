import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { undoReschedule } from "@/modules/arrange/core/arrange";

// Puts back exactly what one reschedule changed. Everything runs as the
// student under RLS, so only their own rows can be touched.
const Body = z.object({
  remove: z.object({
    blocks: z.array(z.uuid()).max(200),
    limits: z.array(z.uuid()).max(14),
  }),
  restore: z.object({
    sessions: z
      .array(
        z.object({
          task_id: z.uuid(),
          start: z.iso.datetime({ offset: true }),
          minutes: z.number().int().min(1).max(1440),
          done: z.boolean(),
        }),
      )
      .max(200),
    limits: z
      .array(
        z.object({
          day: z.iso.date(),
          minutes: z.number().int().min(0).max(720),
          deep: z.boolean(),
        }),
      )
      .max(14),
  }),
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
    await undoReschedule(supabase, body.data);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("undo", error);
    return Response.json({ error: "Couldn't undo." }, { status: 502 });
  }
}
