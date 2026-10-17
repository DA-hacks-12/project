"use client";

import { Button, Flex, Text, TextField } from "@radix-ui/themes";
import { useIsMutating } from "@tanstack/react-query";
import { useState } from "react";
import { originOf } from "@/modules/planner/core/queries";
import {
  natureKey,
  useFindPlaces,
  useNow,
  usePlannerData,
} from "@/modules/planner/ui/planner";
import { Reading } from "./Reading";

// Why the browser gave no position, in a line the student can act on.
const REFUSED: Record<number, string> = {
  1: "Chrome blocks location for this site. Allow it from the icon left of the address bar.",
  2: "Location Services is off for Chrome on this Mac (System Settings, Privacy & Security).",
  3: "Finding your location took too long. Try again.",
};
// No answer at all: a prompt Chrome didn't show, or one left open. The
// browser's own timeout doesn't run while a prompt waits.
const NO_ANSWER =
  "Chrome hasn't shared a location. Check it's allowed for this site, from the icon left of the address bar.";
const NO_ANSWER_MS = 10_000;

/**
 * Location, in Options: where the walks start from. The browser's position
 * (asked from the click, so Chrome shows its prompt, and saying why when it
 * refuses), or a place the student types, found on OpenStreetMap. Without
 * either, walks start near where the connection comes from (approximate).
 */
export function Location() {
  const planner = usePlannerData();
  const { at } = useNow();
  const find = useFindPlaces();
  const busy = useIsMutating({ mutationKey: natureKey }) > 0;
  const [place, setPlace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const origin = originOf(planner.settings);

  const run = (vars: { lat?: number; lon?: number; query?: string }) => {
    setError(null);
    find
      .mutateAsync({ ...vars, at })
      .then(() => setPlace(""))
      .catch((e: unknown) =>
        setError(
          e instanceof Error && e.message !== "Signed out"
            ? e.message
            : "Couldn't find places near there. Try again.",
        ),
      );
  };

  const locate = () => {
    setError(null);
    if (!("geolocation" in navigator))
      return setError("This browser can't share a location.");
    const waiting = setTimeout(() => setError(NO_ANSWER), NO_ANSWER_MS);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(waiting);
        setError(null);
        run({ lat: p.coords.latitude, lon: p.coords.longitude });
      },
      (e) => {
        clearTimeout(waiting);
        setError(REFUSED[e.code] ?? REFUSED[3]);
      },
      { timeout: 20_000 },
    );
  };

  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        {!origin
          ? "Not set"
          : origin.source === "typed"
            ? `From ${origin.label ?? "the place you typed"}`
            : origin.source === "browser"
              ? "From your location"
              : "Approximate, from your connection"}
      </Text>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (place.trim()) run({ query: place.trim() });
        }}
      >
        <Flex gap="2">
          <TextField.Root
            aria-label="Place"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            style={{ flex: 1 }}
          />
          <Button type="submit" disabled={!place.trim() || busy}>
            Set
          </Button>
          <Button type="button" variant="soft" disabled={busy} onClick={locate}>
            Use my location
          </Button>
        </Flex>
      </form>
      {busy && <Reading done={0} total={0} verb="Finding walks" />}
      {error && (
        <Text size="2" color="red" role="alert">
          {error}
        </Text>
      )}
    </Flex>
  );
}
