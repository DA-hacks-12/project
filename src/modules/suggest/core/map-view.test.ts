import { expect, test } from "vitest";
import { mapView, tilesOf, toFrame } from "./map-view";

const from = { lat: 37.3839, lon: -122.0789 };
const park = { lat: 37.3901, lon: -122.0832 };

test("the route sits inside the frame, with room around it, at the closest zoom that holds it", () => {
  const view = mapView([from, park], 308, 168);
  const [west, south, east, north] = view.box;
  expect((east - west) / (north - south)).toBeCloseTo(308 / 168, 5);
  for (const point of [from, park]) {
    const [x, y] = toFrame(view, point);
    expect(x).toBeGreaterThanOrEqual(24 - 0.01);
    expect(x).toBeLessThanOrEqual(308 - 24 + 0.01);
    expect(y).toBeGreaterThanOrEqual(24 - 0.01);
    expect(y).toBeLessThanOrEqual(168 - 24 + 0.01);
  }
  // One zoom closer and it wouldn't fit: it already takes over half the room.
  const [x0] = toFrame(view, from);
  const [x1, y1] = toFrame(view, park);
  const [, y0] = toFrame(view, from);
  expect(
    Math.max(Math.abs(x1 - x0) / (308 - 48), Math.abs(y1 - y0) / (168 - 48)),
  ).toBeGreaterThan(0.5);
  // North is up: the park, north of the start, is higher in the frame.
  expect(toFrame(view, park)[1]).toBeLessThan(toFrame(view, from)[1]);
});

test("a walk next door stops at the basemap's closest zoom", () => {
  const view = mapView([from, from], 308, 168);
  expect(view.zoom).toBe(16);
  expect(toFrame(view, from).map(Math.round)).toEqual([154, 84]);
});

test("the tiles cover the whole frame and no more than they need", () => {
  const view = mapView([from, park], 308, 168);
  const tiles = tilesOf(view);
  expect(tiles.length).toBeGreaterThanOrEqual(2);
  expect(tiles.length).toBeLessThanOrEqual(6);
  const covers = (x: number, y: number) =>
    tiles.some((t) => x >= t.x && x < t.x + 256 && y >= t.y && y < t.y + 256);
  for (const [x, y] of [
    [0, 0],
    [307, 0],
    [0, 167],
    [307, 167],
    [154, 84],
  ])
    expect(covers(x, y)).toBe(true);
  expect(tiles[0].url).toMatch(
    /World_Dark_Gray_Base\/MapServer\/tile\/\d+\/\d+\/\d+$/,
  );
});
