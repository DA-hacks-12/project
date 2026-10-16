import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "./database.types";
import { COOKIE_OPTIONS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// The paths anyone may open: the login screen and the mock Canvas feeds.
const PUBLIC_PATHS = ["/login", "/api/login", "/mock/"];

// Refreshes the auth session on every request. Signed-out visitors go to
// /login and come back to where they were headed; API calls answer 401.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Don't run code between createServerClient and getClaims: it validates
  // (and if needed refreshes) the session.
  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  if (data?.claims || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return response;
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "signed out" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}
