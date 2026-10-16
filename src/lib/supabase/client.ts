import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { COOKIE_OPTIONS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

export type Client = ReturnType<typeof createClient>;

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: COOKIE_OPTIONS,
  });
}
