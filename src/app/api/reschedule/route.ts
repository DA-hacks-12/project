import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { atClock, zoned } from "@/lib/time";
import { reschedule } from "@/modules/arrange/core/arrange";

// Two model calls at most: understanding the answer, then placing the work.
export const maxDuration = 120;

const Body = z.object({
  // `at` pins the clock for demos, in the student's time zone.
  at: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional(),
  scope: z.union([
    z.enum(["hour", "day", "week"]),
    z.object({
      kind: z.literal("clash"),
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
    }),
  ]),
  answer: z.string().max(500).optional(),
  dismiss: z.uuid().optional(),
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad request" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return Response.json({ error: "signed out" }, { status: 401 });

  let now = new Date();
  if (body.data.at) {
    const { data: settings } = await supabase
      .from("settings")
      .select("time_zone")
      .maybeSingle();
    const set = atClock(zoned(now, settings?.time_zone ?? "UTC"), body.data.at);
    if (set) now = new Date(set.epochMilliseconds);
  }
  const { scope, answer, dismiss } = body.data;
  try {
    return Response.json(
      await reschedule(supabase, now, {
        scope: typeof scope === "string" ? { kind: scope } : scope,
        answer,
        dismiss,
      }),
    );
  } catch (error) {
    console.error("reschedule", error);
    return Response.json(
      { error: "Couldn't reschedule right now." },
      { status: 502 },
    );
  }
}
