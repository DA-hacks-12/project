import type { Point } from "./walk";

// A walk's map as one still picture, decided before it's shown so nothing in
// it moves: the closest map zoom at which the route (or the two points) fits
// the frame with room around it, centred on it; the basemap tiles that cover
// that area (Esri's Dark Gray Canvas, no key, cached by the browser for a
// day), each with where it sits in the frame; and where any point falls, for
// the route and the two points drawn on top. A tile pixel is a frame pixel,
// as on the live map it replaced.

const WORLD = 20037508.342789244; // half Web Mercator's width, in metres
const TILE = 256; // pixels
const CLOSEST = 16; // the basemap's closest zoom
const PAD = 24; // pixels kept clear around the route
const TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile";

export interface MapView {
  zoom: number;
  box: [number, number, number, number]; // west, south, east, north, in metres
  width: number; // the frame, in CSS pixels
  height: number;
}

export interface Tile {
  url: string;
  x: number; // where its top left falls in the frame, in CSS pixels
  y: number;
}

/** Metres per pixel at a zoom. */
const perPixel = (zoom: number) => (2 * WORLD) / (TILE * 2 ** zoom);

export function mercator({ lat, lon }: Point): [number, number] {
  return [
    (WORLD * lon) / 180,
    (WORLD / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}

/** The closest zoom showing all `points` in a `width` × `height` frame, centred on them, with room around them. */
export function mapView(
  points: Point[],
  width: number,
  height: number,
): MapView {
  const xy = points.map(mercator);
  const xs = xy.map(([x]) => x);
  const ys = xy.map(([, y]) => y);
  const [west, east] = [Math.min(...xs), Math.max(...xs)];
  const [south, north] = [Math.min(...ys), Math.max(...ys)];
  let zoom = CLOSEST;
  while (
    zoom > 0 &&
    ((east - west) / perPixel(zoom) > width - 2 * PAD ||
      (north - south) / perPixel(zoom) > height - 2 * PAD)
  )
    zoom--;
  const [x, y] = [(west + east) / 2, (south + north) / 2];
  const [halfWidth, halfHeight] = [
    (perPixel(zoom) * width) / 2,
    (perPixel(zoom) * height) / 2,
  ];
  return {
    zoom,
    box: [x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight],
    width,
    height,
  };
}

/** Where `point` falls in the frame, in CSS pixels from its top left. */
export function toFrame(view: MapView, point: Point): [number, number] {
  const [x, y] = mercator(point);
  const [west, south, east, north] = view.box;
  return [
    ((x - west) / (east - west)) * view.width,
    ((north - y) / (north - south)) * view.height,
  ];
}

/** The basemap tiles that cover the frame, each where it sits in it. */
export function tilesOf(view: MapView): Tile[] {
  const scale = perPixel(view.zoom);
  // The frame's top left in the zoom's whole-world pixels.
  const left = (view.box[0] + WORLD) / scale;
  const top = (WORLD - view.box[3]) / scale;
  const count = 2 ** view.zoom;
  const tiles: Tile[] = [];
  for (
    let row = Math.floor(top / TILE);
    row <= Math.floor((top + view.height - 1) / TILE);
    row++
  )
    for (
      let column = Math.floor(left / TILE);
      column <= Math.floor((left + view.width - 1) / TILE);
      column++
    )
      tiles.push({
        url: `${TILES}/${view.zoom}/${row}/${((column % count) + count) % count}`,
        x: column * TILE - left,
        y: row * TILE - top,
      });
  return tiles;
}
