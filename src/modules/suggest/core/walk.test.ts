import { expect, test } from "vitest";
import fossgis from "./fixtures/fossgis-foot.json";
import { directionsLink, estimateWalk, km, parseRoute, routeUrl } from "./walk";

const HOME = { lat: 37.3861, lon: -122.0838 };
const PARK = { lat: 37.399, lon: -122.064 };

test("a FOSSGIS foot route becomes minutes, km and a [lat, lon] line", () => {
  const route = parseRoute(fossgis);
  expect(route).toEqual({
    minutes: 42, // 2510.6 s, rounded up
    km: 3.1,
    estimate: false,
    line: [
      [37.386074, -122.083723],
      [37.397531, -122.076395],
      [37.399179, -122.064567],
    ],
  });
});

test("an answer without a usable route is no route", () => {
  expect(parseRoute(null)).toBeNull();
  expect(parseRoute({ code: "NoRoute", routes: [] })).toBeNull();
  expect(parseRoute({ code: "Ok", routes: [] })).toBeNull();
  expect(
    parseRoute({ code: "Ok", routes: [{ distance: "far", duration: 60 }] }),
  ).toBeNull();
  expect(
    parseRoute({ code: "Ok", routes: [{ distance: 100, duration: -1 }] }),
  ).toBeNull();
});

test("a route without its line still gives the walk", () => {
  expect(
    parseRoute({ code: "Ok", routes: [{ distance: 950, duration: 700 }] }),
  ).toEqual({ minutes: 12, km: 1, estimate: false, line: [] });
});

test("the estimate walks the straight line × 1.3 at 5 km/h", () => {
  const straight = km(HOME, PARK);
  expect(straight).toBeCloseTo(2.3, 1);
  const walk = estimateWalk(HOME, PARK);
  expect(walk.estimate).toBe(true);
  expect(walk.km).toBeCloseTo(straight * 1.3, 1);
  expect(walk.minutes).toBe(Math.ceil(((straight * 1.3) / 5) * 60));
  expect(walk.line).toEqual([
    [HOME.lat, HOME.lon],
    [PARK.lat, PARK.lon],
  ]);
});

test("routes go to the foot server; directions use openstreetmap.org's foot engine", () => {
  expect(routeUrl(HOME, PARK, true)).toBe(
    "https://routing.openstreetmap.de/routed-foot/route/v1/driving/-122.0838,37.3861;-122.064,37.399?overview=full&geometries=geojson",
  );
  expect(directionsLink(HOME, PARK)).toContain("engine=fossgis_osrm_foot");
  expect(directionsLink(HOME, PARK)).toContain(
    "route=37.3861%2C-122.0838%3B37.399%2C-122.064",
  );
});
