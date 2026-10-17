import type { Point } from "./walk";

// A place the student types ("De Anza College", an address) → a point, from
// OpenStreetMap's Nominatim (free, no key; one request a second at most, and
// it asks for a real User-Agent). Searched near a hint (the connection's
// approximate place) so the nearby match comes first. Null when nothing fits.

const SEARCH = "https://nominatim.openstreetmap.org/search";
const NEAR_DEGREES = 0.5; // the box the hint favours, about 50 km each way

export interface Found extends Point {
  label: string; // the place as OpenStreetMap names it, shortened
}

export async function geocode(
  query: string,
  near: Point | null,
): Promise<Found | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
  });
  if (near)
    params.set(
      "viewbox",
      [
        near.lon - NEAR_DEGREES,
        near.lat + NEAR_DEGREES,
        near.lon + NEAR_DEGREES,
        near.lat - NEAR_DEGREES,
      ].join(","),
    );
  const response = await fetch(`${SEARCH}?${params}`, {
    headers: { "User-Agent": "study-planner-demo", Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const [hit] = (await response.json()) as {
    lat: string;
    lon: string;
    name?: string;
    display_name: string;
  }[];
  if (!hit) return null;
  const [lat, lon] = [Number(hit.lat), Number(hit.lon)];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    // Its own name ("De Anza College"); an address has none, so its first
    // two parts ("21250 Stevens Creek Boulevard, Cupertino").
    label:
      hit.name?.trim() ||
      hit.display_name.split(",").slice(0, 2).join(",").trim(),
  };
}
