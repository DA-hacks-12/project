import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adminAuth } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Email in, session out: the email identifies the student, new or returning.
// Nothing is sent. The admin link only carries a one-time token, which is
// verified at once as the student, and that sets the session cookie.
//
// Online, only people with the hackathon's passphrase get in (`ACCESS_CODE`,
// server-only, never in the repo). A deployed app without one stays shut; a
// local dev server without one is open.

const Body = z.object({
  email: z.email().max(254),
  code: z.string().max(200).optional(),
});

const digest = (text: string) => createHash("sha256").update(text).digest();

/** Whether the passphrase lets them in. */
function admitted(code: string | undefined): boolean {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return process.env.NODE_ENV !== "production";
  return timingSafeEqual(digest(code?.trim() ?? ""), digest(expected));
}

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: "That email doesn't look right." },
      { status: 400 },
    );
  }
  if (!admitted(body.data.code))
    return Response.json({ error: "Wrong passphrase." }, { status: 403 });
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
