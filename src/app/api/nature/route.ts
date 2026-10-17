import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { atClock, zoned } from "@/lib/time";
import { bodyClockOf } from "@/modules/arrange/core/body-clock";
import { oneAtATime, untilPlanned } from "@/modules/arrange/core/lock";
import { weekFrom } from "@/modules/arrange/core/plan";
import { refreshNature } from "@/modules/suggest/core/nature-run";

// Walks planned again on the days given (every day of the plan when none):
// after a reschedule or an import, which answer without waiting for them, and
// after a hand-set time covers one. Waits for an import's plan to finish
// first. One Sonnet call at most. Answers with what Undo needs.
export const maxDuration = 180;

const Body = z.object({
  dates: z.array(z.iso.date()).max(14).optional(),
  // `at` pins the clock for demos, in the student's time zone.
  at: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional(),
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
    const { data: settings } = await supabase
      .from("settings")
      .select("time_zone, nights, clock")
      .maybeSingle();
    let now = zoned(new Date(), settings?.time_zone ?? "UTC");
    if (body.data.at) now = atClock(now, body.data.at) ?? now;
    await untilPlanned(supabase);
    const days = weekFrom(now);
    const dates = body.data.dates;
    const which = days
      .map((_, d) => d)
      .filter(
        (d) =>
          !dates ||
          dates.includes(
            days[d].end.subtract({ days: 1 }).toPlainDate().toString(),
          ),
      );
    // One at a time, so two refreshes of a day never both add a walk.
    const walks = await oneAtATime(supabase, () =>
      refreshNature(supabase, {
        now,
        hours: bodyClockOf(settings ?? {}).hours,
        days,
        which,
      }),
    );
    return Response.json(walks);
  } catch (error) {
    console.error("nature", error);
    return Response.json(
      { error: "Couldn't plan the walk again." },
      { status: 502 },
    );
  }
}
