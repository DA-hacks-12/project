import { Temporal } from "temporal-polyfill";
import { mockFeed, SCHOOLS } from "@/modules/import/core/mock";

// Mock Canvas feeds for tests and demos: /mock/state.ics, /mock/college.ics.
// Dates are relative to today in `?tz=` (default: the server's time zone).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const school = file.replace(/\.ics$/, "");
  if (!(school in SCHOOLS)) return new Response("Not found", { status: 404 });
  const tz =
    new URL(request.url).searchParams.get("tz") ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ics = mockFeed(
    school as keyof typeof SCHOOLS,
    Temporal.Now.plainDateISO(tz),
    tz,
  );
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${school}.ics"`,
    },
  });
}
