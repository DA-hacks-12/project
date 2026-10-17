"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type MapView,
  mapView,
  tilesOf,
  toFrame,
} from "@/modules/suggest/core/map-view";
import type { Place } from "@/modules/suggest/core/places";
import { type Point, type Route, walk } from "@/modules/suggest/core/walk";
import styles from "./map-picture.module.css";

// A walk's map as a still picture: the basemap tiles for the area of the walk
// put together into one bitmap, with the route and the two points drawn over
// it. It's made in full before it's shown (the route asked for, every tile
// fetched and decoded), and drawn from that bitmap onto a canvas before the
// first frame paints, so once on screen nothing in it moves or arrives late:
// no tiles filling in, no re-zoom when the route lands. Tiles rather than one
// rendered image: they're cached by the browser for a day (the rendered
// image isn't, and took 1.5 to 5.6 s each when tried), so after the first
// visit a picture is made from the cache. The hover
// preview and the walk's card share one size, so they share the picture. The
// route comes from FOSSGIS foot routing; when it's slow or down, the two
// points alone.

const ROUTE_WAIT_MS = 700; // longer than this, the picture goes without the route
/** The one size of a walk's map: the card's width inside its padding (340 − 2 × 16). */
export const MAP_SIZE = { width: 308, height: 168 };
const SCALE = 2; // device pixels per frame pixel: the picture is put together at twice the size

export interface Picture {
  image: ImageBitmap;
  view: MapView;
  route: [number, number][] | null; // frame pixels
  from: [number, number];
  place: [number, number];
}

// One request per route, kept for the session (an estimate too, so a server
// that's down isn't asked on every hover), shared by preview and card.
const routes = new Map<string, Promise<Route>>();
function routeOf(from: Point, to: Point): Promise<Route> {
  const key = `${from.lat},${from.lon};${to.lat},${to.lon}`;
  let route = routes.get(key);
  if (!route) {
    route = walk(from, to, { line: true });
    routes.set(key, route);
  }
  return route;
}

// One picture per walk. One made without its route is made again (for the
// next time it's shown) once the route arrives.
const pictures = new Map<string, Promise<Picture>>();

/** The walk's picture, ready to draw (its image decoded). */
export function preparePicture(from: Point, place: Place): Promise<Picture> {
  const { width, height } = MAP_SIZE;
  const key = `${from.lat},${from.lon};${place.lat},${place.lon}`;
  const known = pictures.get(key);
  if (known) return known;
  const route = routeOf(from, place);
  const made = (async () => {
    const found = await Promise.race([
      route,
      new Promise<null>((done) => setTimeout(() => done(null), ROUTE_WAIT_MS)),
    ]);
    const line =
      found && !found.estimate && found.line.length > 1 ? found.line : null;
    if (!line)
      void route.then((r) => {
        if (!r.estimate) pictures.delete(key);
      });
    const along = (line ?? []).map(([lat, lon]) => ({ lat, lon }));
    const view = mapView([from, place, ...along], width, height);
    // Every tile, or no picture: a map with a hole in it would look broken.
    const tiles = await Promise.all(
      tilesOf(view).map(async (tile) => {
        const response = await fetch(tile.url);
        if (!response.ok) throw new Error(`tile ${response.status}`);
        return {
          ...tile,
          bitmap: await createImageBitmap(await response.blob()),
        };
      }),
    );
    const sheet = new OffscreenCanvas(width * SCALE, height * SCALE);
    const ink = sheet.getContext("2d");
    if (!ink) throw new Error("no canvas");
    // On whole pixels: at a fraction, each tile's edge blurs and the joins show as lines.
    for (const tile of tiles)
      ink.drawImage(
        tile.bitmap,
        Math.round(tile.x * SCALE),
        Math.round(tile.y * SCALE),
        256 * SCALE,
        256 * SCALE,
      );
    const image = sheet.transferToImageBitmap();
    return {
      image,
      view,
      route: line ? along.map((p) => toFrame(view, p)) : null,
      from: toFrame(view, from),
      place: toFrame(view, place),
    };
  })();
  pictures.set(key, made);
  made.catch(() => pictures.delete(key)); // asked again next time
  return made;
}

// The walks on screen get their pictures made ahead, three at a time from
// the moment the page loads (the routing server is shared and free, so not
// all at once), so a preview opens on the usual half-second rest instead of
// waiting for its picture. One at a time while idle was too slow: about 1.7 s
// each, so a walk hovered soon after the page loaded opened late.
const AHEAD_AT_ONCE = 3;
const ahead: (() => Promise<unknown>)[] = [];
let working = 0;
function workAhead() {
  while (working < AHEAD_AT_ONCE && ahead.length) {
    const next = ahead.shift();
    if (!next) return;
    working++;
    void next()
      .catch(() => {})
      .finally(() => {
        working--;
        workAhead();
      });
  }
}

/** Makes the walk's picture ahead. */
export function preparePictureAhead(from: Point, place: Place) {
  ahead.push(() => preparePicture(from, place));
  workAhead();
}

/** The picture, drawn: the basemap from its bitmap before the first frame paints, the route and points over it. */
export function MapPicture({
  picture,
  card,
}: {
  picture: Picture;
  /** In the walk's card (rounded, within its padding) rather than edge to edge in the preview. */
  card?: boolean;
}) {
  const { width, height } = picture.view;
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    canvas.current
      ?.getContext("2d")
      ?.drawImage(picture.image, 0, 0, width * SCALE, height * SCALE);
  }, [picture, width, height]);
  return (
    <div
      className={`${styles.picture} ${card ? styles.card : ""}`}
      style={{ width, height }}
    >
      <canvas
        ref={canvas}
        className={styles.base}
        width={width * SCALE}
        height={height * SCALE}
      />
      <svg
        className={styles.over}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        {picture.route && (
          <polyline
            className={styles.route}
            points={picture.route.map(([x, y]) => `${x},${y}`).join(" ")}
          />
        )}
        <circle
          className={styles.from}
          cx={picture.from[0]}
          cy={picture.from[1]}
          r={4}
        />
        <circle
          className={styles.place}
          cx={picture.place[0]}
          cy={picture.place[1]}
          r={6}
        />
      </svg>
      <span className={styles.credit}>© Esri © OpenStreetMap</span>
    </div>
  );
}

/** For the walk's card: a quiet space of the same size until the picture is ready (usually it already is), then the picture. */
export function CardMap({ from, place }: { from: Point; place: Place }) {
  const [picture, setPicture] = useState<Picture | null>(null);
  useEffect(() => {
    let live = true;
    preparePicture(from, place)
      .then((p) => live && setPicture(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [from, place]);
  return picture ? (
    <MapPicture picture={picture} card />
  ) : (
    <div className={`${styles.picture} ${styles.card}`} style={MAP_SIZE} />
  );
}
