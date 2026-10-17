import pLimit from "p-limit";
import { km, type Point, type Walk, walk } from "./walk";

// Parks and trails near the student, from OpenStreetMap (Overpass API, free,
// no key), each with the walk there from where the student searched (FOSSGIS
// foot routing). Looked up once per location and saved; nature suggestions
// read the saved list.

export interface Place {
  name: string;
  kind: "park" | "trail" | "reserve" | "garden";
  lat: number;
  lon: number;
  km: number; // straight line from where the student searched
  /** Where the student searched from: the walk starts here. Missing on places saved before walks. */
  from?: Point;
  /** The walk there, one way. Missing on places saved before walks. */
  walk?: Walk;
}

const RADIUS_M = 5000;
const KEEP = 12;
const OTHER_KINDS = 4; // of the 12, room kept for the nearest non-parks
const ROUTES_AT_ONCE = 4; // FOSSGIS is a shared, free server: a few at a time
// The main public server, then two mirrors; all are sometimes busy.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Named parks, reserves, gardens and hiking routes; not sports grounds (a ball park is tagged a park). */
export function query(lat: number, lon: number): string {
  const around = `around:${RADIUS_M},${lat},${lon}`;
  return `[out:json][timeout:45];
(
  way["leisure"~"^(park|nature_reserve|garden)$"]["name"][!"sport"](${around});
  relation["leisure"~"^(park|nature_reserve)$"]["name"][!"sport"](${around});
  relation["route"="hiking"]["name"](${around});
);
out center 200;`;
}

interface Element {
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}

export function placesFrom(
  elements: Element[],
  lat: number,
  lon: number,
): Place[] {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const element of elements) {
    const name = element.tags?.name?.trim();
    const at =
      element.center ??
      (element.lat !== undefined && element.lon !== undefined ? element : null);
    if (
      !name ||
      !at ||
      at.lat === undefined ||
      at.lon === undefined ||
      seen.has(name)
    )
      continue;
    seen.add(name);
    places.push({
      name,
      kind: kindOf(element.tags ?? {}),
      lat: at.lat,
      lon: at.lon,
      km: km({ lat, lon }, { lat: at.lat, lon: at.lon }),
    });
  }
  // The nearest ones, but never only parks: the nearest trails, reserves and
  // gardens come along, so a light day has somewhere bigger to go.
  places.sort((a, b) => a.km - b.km);
  const near = places.slice(0, KEEP - OTHER_KINDS);
  const rest = places.slice(KEEP - OTHER_KINDS);
  const others = rest.filter((p) => p.kind !== "park").slice(0, OTHER_KINDS);
  const fill = rest.filter((p) => !others.includes(p));
  return [...near, ...others, ...fill]
    .slice(0, KEEP)
    .sort((a, b) => a.km - b.km);
}

function kindOf(tags: Record<string, string>): Place["kind"] {
  if (tags.route === "hiking" || tags.highway) return "trail";
  if (tags.leisure === "nature_reserve") return "reserve";
  if (tags.leisure === "garden") return "garden";
  return "park";
}

export async function findPlaces(lat: number, lon: number): Promise<Place[]> {
  let last = "";
  for (const server of OVERPASS) {
    try {
      const response = await fetch(server, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "study-planner-demo",
        },
        body: `data=${encodeURIComponent(query(lat, lon))}`,
        cache: "no-store",
        signal: AbortSignal.timeout(50_000),
      });
      if (!response.ok) {
        last = `answered ${response.status}`;
        continue;
      }
      const { elements } = (await response.json()) as { elements: Element[] };
      return withWalks(placesFrom(elements, lat, lon), { lat, lon });
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`OpenStreetMap ${last}`);
}

/** Each place with the walk there from `from`, nearest on foot first. */
export async function withWalks(
  places: Place[],
  from: Point,
): Promise<Place[]> {
  const limit = pLimit(ROUTES_AT_ONCE);
  const walked = await Promise.all(
    places.map((place) =>
      limit(async () => {
        const { minutes, km, estimate } = await walk(from, place);
        return { ...place, from, walk: { minutes, km, estimate } };
      }),
    ),
  );
  return walked.sort((a, b) => a.walk.minutes - b.walk.minutes);
}

/** A place's walk one way: its saved route, else an estimate from its distance. */
export function walkMinutes(place: Place): number {
  return place.walk?.minutes ?? Math.max(1, Math.ceil(place.km * 1.3 * 12));
}

/** A nature suggestion as saved on its block: the place, its walk, how long to stay. */
export type NatureStop = Place & { stay: number };

export function natureStopOf(saved: unknown): NatureStop | null {
  if (!saved || typeof saved !== "object") return null;
  const stop = saved as Partial<NatureStop>;
  return typeof stop.name === "string" &&
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lon) &&
    Number.isFinite(stop.km) &&
    Number.isFinite(stop.stay)
    ? (stop as NatureStop)
    : null;
}

export function mapLink(place: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
}
