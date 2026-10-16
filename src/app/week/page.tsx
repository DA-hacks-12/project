import { createClient, requireUser } from "@/lib/supabase/server";
import { fetchPlanner } from "@/modules/planner/core/queries";
import { App } from "@/shell/App";

export default async function WeekPage() {
  const supabase = await createClient();
  await requireUser(supabase, "/week");
  const planner = await fetchPlanner(supabase);
  return <App view="week" initial={planner} />;
}
