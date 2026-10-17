"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { Place } from "@/modules/suggest/core/places";
import { type Point, walk } from "@/modules/suggest/core/walk";
import styles from "./nature-map.module.css";

// A small, still map for a nature suggestion's card: where the student
// searched from, the place, and the walking route between them (FOSSGIS foot
// routing, fetched when the card opens). Esri's Dark Gray Canvas tiles: dark,
// quiet and free without a key (CARTO's dark tiles now want one). Leaflet
// needs the browser, so this loads client-only (next/dynamic).

const TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const CREDIT =
  '&copy; Esri &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const MAX_ZOOM = 16; // the deepest these tiles go

type LatLng = [number, number];

// One request per route: the hover preview and the card share it, and a shared
// free server answers 429 when asked twice in a moment. A failed one is asked
// again next time.
const routes = new Map<string, ReturnType<typeof walk>>();
function routeOf(from: Point, to: Point) {
  const key = `${from.lat},${from.lon};${to.lat},${to.lon}`;
  let route = routes.get(key);
  if (!route) {
    route = walk(from, to, { line: true });
    routes.set(key, route);
    void route.then((r) => {
      if (r.estimate) routes.delete(key);
    });
  }
  return route;
}

export default function NatureMap({
  from,
  place,
}: {
  from: Point;
  place: Place;
}) {
  const [line, setLine] = useState<LatLng[] | null>(null);
  const { lat: fromLat, lon: fromLon } = from;
  const { lat, lon } = place;
  useEffect(() => {
    let live = true;
    void routeOf({ lat: fromLat, lon: fromLon }, { lat, lon }).then((route) => {
      if (live && !route.estimate && route.line.length > 1) setLine(route.line);
    });
    return () => {
      live = false;
    };
  }, [fromLat, fromLon, lat, lon]);

  const start: LatLng = [fromLat, fromLon];
  const end: LatLng = [lat, lon];
  const frame = useMemo<LatLng[]>(
    () =>
      line ?? [
        [fromLat, fromLon],
        [lat, lon],
      ],
    [line, fromLat, fromLon, lat, lon],
  );
  return (
    <MapContainer
      className={styles.map}
      bounds={[start, end]}
      boundsOptions={{ padding: [24, 24] }}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      maxZoom={MAX_ZOOM}
    >
      <TileLayer url={TILES} attribution={CREDIT} />
      {line && (
        <Polyline positions={line} pathOptions={{ className: styles.route }} />
      )}
      <CircleMarker
        center={start}
        radius={4}
        pathOptions={{ className: styles.from }}
      />
      <CircleMarker
        center={end}
        radius={6}
        pathOptions={{ className: styles.place }}
      />
      <Fit points={frame} />
    </MapContainer>
  );
}

/** Frames the route once it's known, in one step (no pan or zoom to watch); no Leaflet flag in the credit line. */
function Fit({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix(false);
    map.fitBounds(points, { padding: [24, 24], animate: false });
  }, [map, points]);
  return null;
}
