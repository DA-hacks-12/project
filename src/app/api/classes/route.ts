import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { atClock, zoned } from "@/lib/time";
import { reschedule } from "@/modules/arrange/core/arrange";
import { readSchedule } from "@/modules/classes/core/read";

// A class schedule in (a screenshot or PDF from the school's portal) → Sonnet
// reads the weekly meetings → code checks them → the ones not saved already
// are added (a student at two schools uploads two schedules; the same one
// twice adds nothing) → the planned work a class now covers moves
// (Reschedule, scope "classes"). Answers with how many classes were added and
// sessions moved, and the days whose walks were cleared, for the page to plan
// again.
export const maxDuration = 120;

// Online, a request body can't pass about 4.5 MB, and base64 is a third bigger.
const MAX_BYTES = 3 * 1024 * 1024;

const Body = z.object({
  mediaType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]),
  data: z.base64().max(Math.ceil((MAX_BYTES * 4) / 3) + 4),
  // `at` pins the clock for demos, in the student's time zone.
  at: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional(),
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: "That file can't be read. Try a PNG, JPEG or PDF under 3 MB." },
      { status: 400 },
    );
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return Response.json({ error: "signed out" }, { status: 401 });
  try {
    const { mediaType, data: file } = body.data;
    const classes = await readSchedule(
      mediaType === "application/pdf"
        ? { kind: "pdf", data: file }
        : { kind: "image", mediaType, data: file },
    );
    if (!classes.length)
      return Response.json(
        { error: "Couldn't find any classes in that file." },
        { status: 422 },
      );
    const { data: saved, error: savedError } = await supabase
      .from("classes")
      .select("title, days, start, minutes");
    if (savedError) throw savedError;
    const same = (
      a: (typeof classes)[number],
      b: NonNullable<typeof saved>[number],
    ) =>
      a.title === b.title &&
      a.start === b.start &&
      a.minutes === b.minutes &&
      a.days.join() === [...b.days].sort((x, y) => x - y).join();
    const added = classes.filter((c) => !(saved ?? []).some((s) => same(c, s)));
    if (added.length) {
      const { error: saveError } = await supabase.from("classes").insert(added);
      if (saveError) throw saveError;
    }

    // Planned work a class now covers moves; if that fails, the classes stand
    // and the next reschedule keeps clear of them.
    const { data: settings } = await supabase
      .from("settings")
      .select("time_zone")
      .maybeSingle();
    let now = new Date();
    if (body.data.at) {
      const set = atClock(
        zoned(now, settings?.time_zone ?? "UTC"),
        body.data.at,
      );
      if (set) now = new Date(set.epochMilliseconds);
    }
    const moved = await reschedule(supabase, now, {
      scope: { kind: "classes" },
    }).catch((error) => {
      console.error("classes: reschedule", error);
      return null;
    });
    return Response.json({
      classes: added.length,
      moved: moved?.moved ?? 0,
      walkDays: moved?.walkDays ?? [],
    });
  } catch (error) {
    console.error("classes", error);
    return Response.json(
      { error: "Couldn't read that schedule. Try again." },
      { status: 502 },
    );
  }
}
