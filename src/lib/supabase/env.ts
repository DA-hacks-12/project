export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Our own session cookie name. Renna's local Supabase also runs on 127.0.0.1,
// and browsers share localhost cookies across ports, so the default name
// ("sb-127-auth-token") would let the two apps overwrite each other's session.
export const COOKIE_OPTIONS = { name: "sb-planner-auth-token" };
