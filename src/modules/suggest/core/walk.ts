// Walking time to a place, from OpenStreetMap's foot routing: FOSSGIS's OSRM
// server, the one openstreetmap.org's own directions use (free, no key, open
// to browsers). The public OSRM demo server is not used: it ignores the foot
// profile and answers with driving times. When FOSSGIS can't be reached, the
// walk is worked out from the straight line (× 1.3 for streets, at 5 km/h)
// and marked as an estimate.

export interface Point {
  lat: number;
  lon: number;
}

export interface Walk {
  minutes: number; // one way, rounded up
  km: number; // along the way, to 0.1 km
  estimate: boolean; // true: no route, worked out from the straight line
}

export interface Route extends Walk {
  line: [number, number][]; // [lat, lon] points, start to place
}

const FOSSGIS = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const DETOUR = 1.3;
const KMH = 5;
const TIMEOUT_MS = 8000;

export function routeUrl(from: Point, to: Point, line: boolean): string {
  const where = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  return `${FOSSGIS}/${where}?overview=${line ? "full" : "false"}&geometries=geojson`;
}

/** Directions on openstreetmap.org, on foot. ("osrm_foot" isn't an engine there; it falls back to the car.) */
export function directionsLink(from: Point, to: Point): string {
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from.lat}%2C${from.lon}%3B${to.lat}%2C${to.lon}`;
}

/** Great-circle distance, rounded to 0.1 km. */
export function km(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** The walk from the straight line, when there's no route. */
export function estimateWalk(from: Point, to: Point): Route {
  const along = km(from, to) * DETOUR;
  return {
    minutes: Math.max(1, Math.ceil((along / KMH) * 60)),
    km: Math.round(along * 10) / 10,
    estimate: true,
    line: [
      [from.lat, from.lon],
      [to.lat, to.lon],
    ],
  };
}

/** An OSRM answer, or null when it doesn't hold a route. */
export function parseRoute(body: unknown): Route | null {
  if (!body || typeof body !== "object") return null;
  const { code, routes } = body as { code?: unknown; routes?: unknown };
  if (code !== "Ok" || !Array.isArray(routes) || routes.length === 0)
    return null;
  const route = routes[0] as {
    distance?: unknown;
    duration?: unknown;
    geometry?: { coordinates?: unknown };
  };
  if (
    typeof route.distance !== "number" ||
    typeof route.duration !== "number" ||
    !Number.isFinite(route.distance) ||
    !Number.isFinite(route.duration) ||
    route.distance < 0 ||
    route.duration < 0
  )
    return null;
  const coordinates = Array.isArray(route.geometry?.coordinates)
    ? (route.geometry.coordinates as unknown[])
    : [];
  const line = coordinates.flatMap((c): [number, number][] =>
    Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
      ? [[c[1], c[0]]]
      : [],
  );
  return {
    minutes: Math.max(1, Math.ceil(route.duration / 60)),
    km: Math.round(route.distance / 100) / 10,
    estimate: false,
    line,
  };
}

/** The walk from `from` to `to`, with its line when `line` is set. Never throws. */
export async function walk(
  from: Point,
  to: Point,
  { line = false }: { line?: boolean } = {},
): Promise<Route> {
  // A shared free server: when it says "too many" (429), ask once more.
  for (const attempt of [0, 1]) {
    try {
      const response = await fetch(routeUrl(from, to, line), {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        const route = parseRoute(await response.json());
        if (route) return route;
      }
      if (response.status !== 429) break;
    } catch {
      break; // unreachable or slow: fall through to the estimate
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
  }
  return estimateWalk(from, to);
}
