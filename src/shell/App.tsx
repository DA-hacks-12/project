"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { activityFromExtension } from "@/modules/extension/ui/bridge";
import type { Planner } from "@/modules/planner/core/queries";
import {
  usePlanner,
  usePlannerData,
  useSaveActivity,
} from "@/modules/planner/ui/planner";
import { DayView } from "./DayView";
import { Focus } from "./Focus";
import { Frame } from "./Frame";
import { Options } from "./Options";
import { LastRescheduleProvider } from "./RescheduleResult";
import { WeekView } from "./WeekView";

export type View = "day" | "week" | "focus" | "options";

export function App({
  view,
  initial,
  focus,
}: {
  view: View;
  initial: Planner;
  focus?: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LastRescheduleProvider>
        <Loaded initial={initial}>
          <ActiveHoursSync />
          {view === "focus" && focus ? (
            <Focus id={focus} />
          ) : (
            <Frame view={view}>
              {view === "week" ? (
                <WeekView />
              ) : view === "options" ? (
                <Options />
              ) : (
                <DayView />
              )}
            </Frame>
          )}
        </Loaded>
      </LastRescheduleProvider>
    </QueryClientProvider>
  );
}

function Loaded({
  initial,
  children,
}: {
  initial: Planner;
  children: React.ReactNode;
}) {
  const { data } = usePlanner(initial);
  return data ? children : null;
}

/** When the extension is installed, the app takes what it learned on load. */
function ActiveHoursSync() {
  const planner = usePlannerData();
  const save = useSaveActivity();
  const saved = JSON.stringify([
    planner.settings?.active_hours ?? null,
    planner.settings?.nights ?? null,
  ]);
  const { mutate } = save;
  useEffect(() => {
    let live = true;
    activityFromExtension().then((activity) => {
      if (
        live &&
        activity &&
        JSON.stringify([activity.hours, activity.nights]) !== saved
      )
        mutate(activity);
    });
    return () => {
      live = false;
    };
  }, [saved, mutate]);
  return null;
}
