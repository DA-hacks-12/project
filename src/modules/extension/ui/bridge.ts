"use client";

import { useEffect, useState } from "react";

// Talks to the Chrome extension through its content script, which listens on
// this page. No extension id needed; when it isn't installed, calls answer null.

const SOURCE = "planner";
const REPLY = "planner-extension";
const WAIT_MS = 1500;

type Request =
  | { type: "ping" }
  | { type: "activity" }
  | { type: "focus"; until: string }
  | { type: "unfocus" };

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
    window.postMessage(
      { source: SOURCE, id, ...request },
      window.location.origin,
    );
  });
}

export async function activeHoursFromExtension(): Promise<number[] | null> {
  const result = await askExtension<{ hours: number[] }>({ type: "activity" });
  const hours = result?.hours;
  return Array.isArray(hours) &&
    hours.length === 24 &&
    hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 100)
    ? hours
    : null;
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
