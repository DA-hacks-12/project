// Parks and trails near the student, from OpenStreetMap (Overpass API, free,
// no key). Looked up once per location and saved; free time reads the saved list.

export interface Place {
  name: string;
  kind: "park" | "trail" | "reserve" | "garden";
  lat: number;
  lon: number;
  km: number;
}

const RADIUS_M = 5000;
const KEEP = 12;
// The main public server, then two mirrors; all are sometimes busy.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export function query(lat: number, lon: number): string {
  const around = `around:${RADIUS_M},${lat},${lon}`;
  return `[out:json][timeout:45];
(
  way["leisure"~"^(park|nature_reserve|garden)$"]["name"](${around});
  relation["leisure"~"^(park|nature_reserve)$"]["name"](${around});
  relation["route"="hiking"]["name"](${around});
);
out center 80;`;
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
      km: km(lat, lon, at.lat, at.lon),
    });
  }
  return places.sort((a, b) => a.km - b.km).slice(0, KEEP);
}

function kindOf(tags: Record<string, string>): Place["kind"] {
  if (tags.route === "hiking" || tags.highway) return "trail";
  if (tags.leisure === "nature_reserve") return "reserve";
  if (tags.leisure === "garden") return "garden";
  return "park";
}

/** Great-circle distance, rounded to 0.1 km. */
export function km(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(a)) * 10) / 10;
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
      return placesFrom(elements, lat, lon);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`OpenStreetMap ${last}`);
}

export function mapLink(place: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
}
