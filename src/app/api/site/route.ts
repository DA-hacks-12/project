import { createClient } from "@/lib/supabase/server";
import { judgeSite } from "@/modules/extension/core/judge";
import { plainHost } from "@/modules/extension/core/site";

// Lockdown's question from the extension: is this site for study or a
// distraction? Signed-in students only; the API key stays here.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const host = plainHost(body?.host);
  if (!host) return Response.json({ error: "bad request" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return Response.json({ error: "signed out" }, { status: 401 });
  const verdict = await judgeSite(host);
  if (!verdict)
    return Response.json({ error: "Couldn't ask the model." }, { status: 502 });
  return Response.json({ host, verdict });
}
