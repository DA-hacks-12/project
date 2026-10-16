import { createClient, requireUser } from "@/lib/supabase/server";
import { fetchPlanner } from "@/modules/planner/core/queries";
import { App } from "@/shell/App";

export default async function OptionsPage() {
  const supabase = await createClient();
  await requireUser(supabase, "/options");
  const planner = await fetchPlanner(supabase);
  return <App view="options" initial={planner} />;
}
