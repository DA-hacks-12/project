"use client";

import { useEffect, useState } from "react";
import { type Night, nightsOf } from "@/modules/arrange/core/body-clock";

// Talks to the Chrome extension through its content script, which listens on
// this page. No extension id needed; when it isn't installed, calls answer null.
// Every request carries the page's pinned demo clock (`?at=`), if any, so the
// extension asks the app about the same moment.

const SOURCE = "planner";
const REPLY = "planner-extension";
const WAIT_MS = 1500;

type Request =
  | { type: "ping" }
  | { type: "activity" }
  // Focus mode started or resumed, ending in `seconds` (an `until` time is
  // still taken, but seconds keep working on a pinned demo clock). The
  // extension blocks only when Lockdown is on in Options; it decides, the app
  // always tells it.
  | ({
      type: "focus";
      id?: string; // the session's block, for its focus page
      title: string;
      course: string | null;
    } & ({ seconds: number } | { until: string }))
  // Focus mode paused, done or left.
  | { type: "unfocus" }
  // The Lockdown setting changed: the extension asks the app again at once.
  | { type: "sync" };

export function askExtension<T>(request: Request): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", listen);
      resolve(null);
    }, WAIT_MS);
    function listen(event: MessageEvent) {
      if (
        event.source !== window ||
        event.data?.source !== REPLY ||
        event.data.id !== id
      )
        return;
      clearTimeout(timer);
      window.removeEventListener("message", listen);
      resolve((event.data.result ?? null) as T | null);
    }
    window.addEventListener("message", listen);
    const at = new URLSearchParams(window.location.search).get("at");
    window.postMessage(
      { source: SOURCE, id, ...request, ...(at ? { at } : {}) },
      window.location.origin,
    );
  });
}

/** What the extension learned from browser history: active hours and nights. */
export async function activityFromExtension(): Promise<{
  hours: number[];
  nights: Night[];
} | null> {
  const result = await askExtension<{ hours: number[]; nights: unknown }>({
    type: "activity",
  });
  const hours = result?.hours;
  return Array.isArray(hours) &&
    hours.length === 24 &&
    hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 100)
    ? { hours, nights: nightsOf(result?.nights) }
    : null;
}

/** After the Lockdown setting changes in Options, so it takes effect at once. */
export function syncLockdown(): Promise<unknown> {
  return askExtension({ type: "sync" });
}

let present: Promise<boolean> | null = null;

/** Whether the optional extension is installed; asked once per page load. */
export function extensionPresent(): Promise<boolean> {
  present ??= askExtension<{ ok: boolean }>({ type: "ping" }).then(
    (r) => !!r?.ok,
  );
  return present;
}

/** null while asking, then true or false. */
export function useExtension(): boolean | null {
  const [here, setHere] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    extensionPresent().then((found) => {
      if (live) setHere(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return here;
}
