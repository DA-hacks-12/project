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
// The public servers, all asked at once: the first good answer wins. Each is
// often busy (the main one took 24 to 42 seconds when tried, a mirror 7 to
// 16, others answered with errors), so waiting on one at a time was slow.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// What OpenStreetMap had near a spot (about a kilometre square), kept for a
// day, so another search from the same area skips the slow part.
const NEARBY_MS = 24 * 60 * 60_000;
type Nearby = Map<string, { at: number; elements: Element[] }>;
const shared = globalThis as { placesNearby?: Nearby };
if (!shared.placesNearby) shared.placesNearby = new Map();
const nearby: Nearby = shared.placesNearby;

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
  const area = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const known = nearby.get(area);
  const fresh = known && Date.now() - known.at < NEARBY_MS ? known : null;
  const elements = fresh?.elements ?? (await fromOverpass(lat, lon));
  if (!fresh) nearby.set(area, { at: Date.now(), elements });
  return withWalks(placesFrom(elements, lat, lon), { lat, lon });
}

/** Every server at once; the first that answers in full wins, the rest are stopped. */
async function fromOverpass(lat: number, lon: number): Promise<Element[]> {
  const stop = new AbortController();
  try {
    return await Promise.any(
      OVERPASS.map(async (server) => {
        const response = await fetch(server, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "study-planner-demo",
          },
          body: `data=${encodeURIComponent(query(lat, lon))}`,
          cache: "no-store",
          signal: AbortSignal.any([stop.signal, AbortSignal.timeout(50_000)]),
        });
        if (!response.ok) throw new Error(`answered ${response.status}`);
        const body = (await response.json()) as {
          elements?: Element[];
          remark?: string;
        };
        // A busy server can answer 200 with a timeout in `remark` and no places.
        if (!body.elements || /error|timed out/i.test(body.remark ?? ""))
          throw new Error(body.remark ?? "no elements");
        return body.elements;
      }),
    );
  } catch (error) {
    const why =
      error instanceof AggregateError
        ? error.errors.map((e) => (e instanceof Error ? e.message : e))
        : [error];
    throw new Error(`OpenStreetMap: ${why.join("; ")}`);
  } finally {
    stop.abort();
  }
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
