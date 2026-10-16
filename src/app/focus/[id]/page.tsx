import { createClient, requireUser } from "@/lib/supabase/server";
import { fetchPlanner } from "@/modules/planner/core/queries";
import { App } from "@/shell/App";

export default async function FocusPage(props: PageProps<"/focus/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  await requireUser(supabase, `/focus/${id}`);
  const planner = await fetchPlanner(supabase);
  return <App view="focus" focus={id} initial={planner} />;
}
