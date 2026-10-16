import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_URL } from "./env";

// Admin access, used for one thing only: starting a session from an email in
// /api/login (the owner's call: an email identifies the student, with no code
// or password). All data is still read and written as the signed-in student
// under RLS, never through this client.
export function adminAuth() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is missing");
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}
