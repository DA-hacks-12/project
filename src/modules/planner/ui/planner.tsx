"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { atClock, type Zoned, zoned } from "@/lib/time";
import { isReading, timeZoneOf } from "../core/items";
import type { Planner } from "../core/queries";
import * as q from "../core/queries";

export const plannerKey = ["planner"];

export function usePlanner(initialData?: Planner) {
  return useQuery({
    queryKey: plannerKey,
    queryFn: () => q.fetchPlanner(createClient()),
    initialData,
    // While the model reads freshly imported assignments, check back each second.
    refetchInterval: (query) => {
      const planner = query.state.data;
      return planner?.tasks.some((t) => isReading(planner, t)) ? 1000 : false;
    },
  });
}

/** The loaded planner; screens render inside the Shell, which loads it first. */
export function usePlannerData(): Planner {
  const { data } = usePlanner();
  if (!data) throw new Error("The planner isn't loaded");
  return data;
}

/** Optimistic and ordered: the cache changes at once, writes land in order. */
function usePlannerMutation<V>(
  run: (db: q.Db, vars: V) => Promise<void>,
  apply: (p: Planner, vars: V) => Planner,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: plannerKey,
    scope: { id: "planner" },
    mutationFn: (vars: V) => run(createClient(), vars),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: plannerKey });
      const previous = queryClient.getQueryData<Planner>(plannerKey);
      if (previous)
        queryClient.setQueryData<Planner>(plannerKey, apply(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(plannerKey, context.previous);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: plannerKey }) === 1) {
        return queryClient.invalidateQueries({ queryKey: plannerKey });
      }
    },
  });
}

export const useSetTaskDone = () =>
  usePlannerMutation<{ id: string; done: boolean }>(
    (db, { id, done }) => q.setTaskDone(db, id, done),
    (p, { id, done }) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === id ? { ...t, done } : t)),
    }),
  );

export const useSetBlockDone = () =>
  usePlannerMutation<{ id: string; done: boolean }>(
    (db, { id, done }) => q.setBlockDone(db, id, done),
    (p, { id, done }) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.id === id ? { ...b, done } : b)),
    }),
  );

export const useAddEvent = () =>
  usePlannerMutation<{ id: string; draft: q.EventDraft }>(
    (db, { id, draft }) => q.addEvent(db, id, draft),
    (p, { id, draft }) => ({
      ...p,
      blocks: [
        ...p.blocks,
        {
          id,
          owner_id: "",
          kind: "event",
          task_id: null,
          rest: null,
          done: false,
          ...draft,
        },
      ],
    }),
  );

export const useUpdateEvent = () =>
  usePlannerMutation<{ id: string; draft: q.EventDraft }>(
    (db, { id, draft }) => q.updateEvent(db, id, draft),
    (p, { id, draft }) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.id === id ? { ...b, ...draft } : b)),
    }),
  );

export const useDeleteBlock = () =>
  usePlannerMutation<{ id: string }>(
    (db, { id }) => q.deleteBlock(db, id),
    (p, { id }) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) }),
  );

export const useAddReminder = () =>
  usePlannerMutation<{ id: string; text: string }>(
    (db, { id, text }) => q.addReminder(db, id, text),
    (p, { id, text }) => ({
      ...p,
      reminders: [
        ...p.reminders,
        {
          id,
          text,
          done: false,
          owner_id: "",
          created_at: new Date().toISOString(),
        },
      ],
    }),
  );

export const useSetReminderDone = () =>
  usePlannerMutation<{ id: string; done: boolean }>(
    (db, { id, done }) => q.setReminderDone(db, id, done),
    (p, { id, done }) => ({
      ...p,
      reminders: p.reminders.map((r) => (r.id === id ? { ...r, done } : r)),
    }),
  );

export const useSaveActiveHours = () =>
  usePlannerMutation<{ hours: number[] }>(
    (db, { hours }) => q.saveActiveHours(db, hours),
    (p, { hours }) =>
      p.settings
        ? { ...p, settings: { ...p.settings, active_hours: hours } }
        : p,
  );

/** Sign out here and go to the login screen, coming back to this page after. */
export async function signOut(): Promise<void> {
  await createClient().auth.signOut({ scope: "local" });
  const here = window.location.pathname + window.location.search;
  window.location.assign(
    here === "/day" ? "/login" : `/login?next=${encodeURIComponent(here)}`,
  );
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // A session the server no longer accepts: clear it rather than fail again.
  if (response.status === 401) {
    await signOut();
    throw new Error("Signed out");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error ?? `Request failed (${response.status})`);
  return result as T;
}

/** Calls that run the model or reach another service go through the server. */
function useServerCall<V, R>(path: string, mutationKey?: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn: (vars: V) => post<R>(path, vars),
    onSettled: () => queryClient.invalidateQueries({ queryKey: plannerKey }),
  });
}

export type ImportSource =
  | { kind: "link"; url: string }
  | { kind: "file"; name: string; ics: string };

export const useImportFeed = () =>
  useServerCall<
    { source: ImportSource; timeZone: string },
    { school: string; upcoming: number; reading: number }
  >("/api/import");

export const useDeleteFeed = () =>
  usePlannerMutation<{ id: string }>(
    (db, { id }) => q.deleteFeed(db, id),
    (p, { id }) => {
      const tasks = new Set(
        p.tasks.filter((t) => t.feed_id === id).map((t) => t.id),
      );
      return {
        ...p,
        feeds: p.feeds.filter((f) => f.id !== id),
        tasks: p.tasks.filter((t) => !tasks.has(t.id)),
        blocks: p.blocks.filter((b) => !tasks.has(b.task_id ?? "")),
      };
    },
  );

export type Scope = "hour" | "day" | "week";

export interface Undo {
  remove: { blocks: string[]; limits: string[] };
  restore: {
    sessions: {
      task_id: string;
      start: string;
      minutes: number;
      done: boolean;
    }[];
    limits: { day: string; minutes: number; deep: boolean }[];
  };
}

export interface Rescheduled {
  moved: number;
  placed: number;
  unplaced: number;
  changes: string[];
  undo: Undo;
}

export const rescheduleKey = ["reschedule"];

export const useReschedule = () =>
  useServerCall<
    {
      at?: string;
      scope: Scope | { kind: "clash"; start: string; end: string };
      answer?: string;
      dismiss?: string;
    },
    Rescheduled
  >("/api/reschedule", rescheduleKey);

export const useUndoReschedule = () =>
  useServerCall<Undo, { ok: true }>("/api/reschedule/undo", rescheduleKey);

/**
 * After the student adds or moves a block of their own: if it now covers
 * planned work that hasn't started, just that work moves.
 */
export function useRescheduleAround() {
  const planner = usePlannerData();
  const reschedule = useReschedule();
  const { now, at } = useNow();
  return (draft: q.EventDraft, id?: string) => {
    const start = Date.parse(draft.start);
    const end = start + draft.minutes * 60_000;
    const clash = planner.blocks.some((b) => {
      if (b.kind !== "session" || b.done || b.id === id) return false;
      const from = Date.parse(b.start);
      return (
        from >= now.epochMilliseconds &&
        from < end &&
        start < from + b.minutes * 60_000
      );
    });
    if (clash) {
      reschedule.mutate({
        at,
        scope: {
          kind: "clash",
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        },
      });
    }
  };
}

export const useDeleteLimit = () =>
  usePlannerMutation<{ id: string }>(
    (db, { id }) => q.deleteLimit(db, id),
    (p, { id }) => ({ ...p, limits: p.limits.filter((l) => l.id !== id) }),
  );

export const useFindPlaces = () =>
  useServerCall<{ lat: number; lon: number }, unknown>("/api/places");

/**
 * The clock in the student's time zone. `?at=HH:MM` pins it for demos;
 * otherwise it ticks every 30 seconds.
 */
export function useNow(): { now: Zoned; at: string | undefined } {
  const planner = usePlannerData();
  const tz = timeZoneOf(planner);
  const at = useSearchParams().get("at") ?? undefined;
  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const real = zoned(tick, tz);
  const pinned = at ? atClock(real, at) : null;
  return { now: pinned ?? real, at: pinned ? at : undefined };
}
