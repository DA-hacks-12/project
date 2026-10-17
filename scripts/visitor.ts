// A visitor to the dev server: signs in by email the way the login page does,
// keeps the session cookie, and talks to Supabase as that student, the way
// the browser writes (under RLS). Shared by the end-to-end check and the demo.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

export const APP = "http://localhost:3000";
const SUPABASE = "http://127.0.0.1:54421";
const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

export class Visitor {
  private cookies = new Map<string, string>();

  private remember(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
  }

  private get cookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async get(path: string) {
    const response = await fetch(APP + path, {
      headers: { cookie: this.cookie },
      redirect: "manual",
    });
    this.remember(response);
    await response.arrayBuffer();
    return response.status;
  }

  async post<T = Record<string, unknown>>(
    path: string,
    body: unknown,
  ): Promise<[number, T]> {
    // Signing in carries the passphrase when this server asks for one.
    const sent =
      path === "/api/login" && process.env.ACCESS_CODE
        ? { ...(body as object), code: process.env.ACCESS_CODE }
        : body;
    const response = await fetch(APP + path, {
      method: "POST",
      headers: { cookie: this.cookie, "content-type": "application/json" },
      body: JSON.stringify(sent),
    });
    this.remember(response);
    return [response.status, (await response.json().catch(() => ({}))) as T];
  }

  /** Supabase as this student, the way the browser writes. */
  get db() {
    const raw = [...this.cookies]
      .filter(([name]) => name.startsWith("sb-planner-auth-token"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => decodeURIComponent(value))
      .join("")
      .replace(/^base64-/, "");
    const session = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return createClient<Database>(SUPABASE, KEY, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false },
    });
  }
}
