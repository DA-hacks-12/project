import { createClient } from "@/lib/supabase/server";

// The extension's connection status: who's signed in to the app here.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return Response.json({ error: "signed out" }, { status: 401 });
  return Response.json({ email: data.user.email ?? null });
}
