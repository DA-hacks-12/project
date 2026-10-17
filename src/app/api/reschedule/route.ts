import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { atClock, zoned } from "@/lib/time";
import { reschedule } from "@/modules/arrange/core/arrange";
import { advise } from "@/modules/suggest/core/advise";

// Two model calls in turn at most (understanding the answer, then placing the
// work), with the one-line advice on the answer running beside them.
export const maxDuration = 120;

const Body = z.object({
  // `at` pins the clock for demos, in the student's time zone.
  at: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional(),
  scope: z.union([
    z.enum(["day", "week"]),
    z.object({
      kind: z.literal("clash"),
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
    }),
  ]),
  // With Day: which of the plan's days (today when missing).
  day: z.iso.date().optional(),
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
  const { scope, day, answer, dismiss } = body.data;
  try {
    // Advice is extra: if it fails, the reschedule still answers, without it.
    const [result, advice] = await Promise.all([
      reschedule(supabase, now, {
        scope:
          scope === "day"
            ? { kind: "day", date: day }
            : typeof scope === "string"
              ? { kind: scope }
              : scope,
        answer,
        dismiss,
      }),
      advise(supabase, now, { answer, dismiss }).catch((error) => {
        console.error("advice", error);
        return null;
      }),
    ]);
    return Response.json(advice ? { ...result, advice } : result);
  } catch (error) {
    console.error("reschedule", error);
    return Response.json(
      { error: "Couldn't reschedule right now." },
      { status: 502 },
    );
  }
}
