import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { atClock, zoned } from "@/lib/time";
import { bodyClockOf } from "@/modules/arrange/core/body-clock";
import { oneAtATime, untilPlanned } from "@/modules/arrange/core/lock";
import { weekFrom } from "@/modules/arrange/core/plan";
import { refreshNature } from "@/modules/suggest/core/nature-run";
import { findPlaces } from "@/modules/suggest/core/places";

// OpenStreetMap can take most of a minute when busy, and the walks wait for
// an import's plan to finish.
export const maxDuration = 180;

// Where the student is: the browser's position when it gives one; else the
// approximate place their connection comes from (Vercel's own geolocation
// headers, about city-level, no permission needed), so a browser or a Mac
// that won't share a location still gets walks. From there, walks are
// marked as estimates ("About 12 min walk").
const Body = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
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
  const fromIp = (name: string) => {
    const value = Number(decodeURIComponent(request.headers.get(name) ?? ""));
    return request.headers.has(name) && Number.isFinite(value) ? value : null;
  };
  const browser =
    body.data.lat !== undefined && body.data.lon !== undefined
      ? { lat: body.data.lat, lon: body.data.lon }
      : null;
  const ipLat = fromIp("x-vercel-ip-latitude");
  const ipLon = fromIp("x-vercel-ip-longitude");
  const here =
    browser ??
    (ipLat !== null && ipLon !== null ? { lat: ipLat, lon: ipLon } : null);
  if (!here)
    return Response.json(
      { error: "Where you are isn't known." },
      { status: 422 },
    );
  try {
    const found = await findPlaces(here.lat, here.lon);
    // From an approximate spot, every walk is an estimate.
    const places = browser
      ? found
      : found.map((p) => ({
          ...p,
          walk: p.walk ? { ...p.walk, estimate: true } : p.walk,
        }));
    const { error } = await supabase
      .from("settings")
      .upsert({ places: JSON.parse(JSON.stringify(places)) });
    if (error) throw error;
    // Places found during an import (it asks for them too): wait for its
    // plan, then plan the walks.
    await untilPlanned(supabase);
    // With places known, the rest of the week gets its nature suggestions.
    const { data: settings } = await supabase
      .from("settings")
      .select("time_zone, nights, clock")
      .maybeSingle();
    let now = zoned(new Date(), settings?.time_zone ?? "UTC");
    if (body.data.at) now = atClock(now, body.data.at) ?? now;
    const days = weekFrom(now);
    const walks = await oneAtATime(supabase, () =>
      refreshNature(supabase, {
        now,
        hours: bodyClockOf(settings ?? {}).hours,
        days,
        which: days.map((_, d) => d),
      }),
    ).catch((e) => {
      console.error("nature", e);
      return { added: [], removed: [] };
    });
    return Response.json({ places, ...walks });
  } catch (error) {
    console.error("places", error);
    return Response.json(
      { error: "Couldn't reach OpenStreetMap." },
      { status: 502 },
    );
  }
}
