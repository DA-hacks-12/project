import { createClient, requireUser } from "@/lib/supabase/server";
import { fetchPlanner } from "@/modules/planner/core/queries";
import { App } from "@/shell/App";

export default async function DayPage() {
  const supabase = await createClient();
  await requireUser(supabase, "/day");
  const planner = await fetchPlanner(supabase);
  return <App view="day" initial={planner} />;
}
