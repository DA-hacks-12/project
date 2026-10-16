import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findPlaces } from "@/modules/suggest/core/places";

// OpenStreetMap can take most of a minute when busy.
export const maxDuration = 120;

const Body = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
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
    const places = await findPlaces(body.data.lat, body.data.lon);
    const { error } = await supabase
      .from("settings")
      .upsert({ places: JSON.parse(JSON.stringify(places)) });
    if (error) throw error;
    return Response.json({ places });
  } catch (error) {
    console.error("places", error);
    return Response.json(
      { error: "Couldn't reach OpenStreetMap." },
      { status: 502 },
    );
  }
}
