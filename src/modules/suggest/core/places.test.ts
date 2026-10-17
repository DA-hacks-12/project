import { afterEach, expect, test, vi } from "vitest";
import { findPlaces, placesFrom, walkMinutes } from "./places";
import { walk } from "./walk";

afterEach(() => vi.unstubAllGlobals());

const from = { lat: 37.3861, lon: -122.0838 };
const to = { lat: 37.395, lon: -122.072 };

test("when the foot server is down or busy, the walk is the estimate", async () => {
  for (const down of [
    () => Promise.reject(new Error("offline")),
    () => Promise.resolve(new Response("", { status: 429 })),
    () => Promise.resolve(Response.json({ code: "NoRoute" })),
  ]) {
    vi.stubGlobal("fetch", vi.fn(down));
    const route = await walk(from, to);
    expect(route.estimate).toBe(true);
    expect(route.minutes).toBeGreaterThan(20); // about 1.5 km on foot, not a drive
  }
});

test("when every Overpass server fails, finding places throws (the route says so; nothing is saved)", async () => {
  const fetchMock = vi.fn(() => Promise.reject(new Error("timeout")));
  vi.stubGlobal("fetch", fetchMock);
  await expect(findPlaces(from.lat, from.lon)).rejects.toThrow(/OpenStreetMap/);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("a place saved before walks still has a walk", () => {
  expect(
    walkMinutes({ name: "Old", kind: "park", lat: 0, lon: 0, km: 1 }),
  ).toBe(16);
});

test("the kept places aren't all parks: the nearest trails and reserves come along", () => {
  const park = (i: number) => ({
    tags: { name: `Park ${i}`, leisure: "park" },
    center: { lat: 37.3861 + i * 0.001, lon: -122.0838 },
  });
  const elements = [
    ...Array.from({ length: 20 }, (_, i) => park(i)),
    {
      tags: { name: "Ridge Trail", route: "hiking" },
      center: { lat: 37.42, lon: -122.0838 },
    },
  ];
  const kept = placesFrom(elements, 37.3861, -122.0838);
  expect(kept).toHaveLength(12);
  expect(kept.map((p) => p.name)).toContain("Ridge Trail");
  expect(kept[0].name).toBe("Park 0");
});
