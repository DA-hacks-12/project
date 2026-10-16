import { z } from "zod";
import { adminAuth } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Email in, session out: the email identifies the student, new or returning.
// Nothing is sent. The admin link only carries a one-time token, which is
// verified at once as the student, and that sets the session cookie.

const Body = z.object({ email: z.email().max(254) });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: "That email doesn't look right." },
      { status: 400 },
    );
  }
  const email = body.data.email.trim().toLowerCase();
  const { data, error } = await adminAuth().generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    console.error("login link", error);
    return Response.json(
      { error: "Couldn't sign in. Try again." },
      { status: 502 },
    );
  }
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  if (verifyError) {
    console.error("login verify", verifyError);
    return Response.json(
      { error: "Couldn't sign in. Try again." },
      { status: 502 },
    );
  }
  return Response.json({ ok: true });
}
