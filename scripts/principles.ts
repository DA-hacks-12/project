// How well a plan follows the principles the planner is told to use. A new
// student with a late sleeper's body clock imports both mock schools; the plan
// made on import, then a Reschedule → Week, are scored:
//   synchrony  deep work's average alertness against light work's
//   spreading  long tasks spread over two or more days
//   breaks     back-to-back sessions under 10 minutes apart
//   same task  the same task twice in a row (a long session in disguise)
//   courses    how often the next session changes course
//   wind-down  deep work ending in the hour before sleep
//   pacing     stretches of work (sessions under 30 minutes apart) over 90 minutes
// The hard rules (deadlines, overlaps, asleep hours, caps) are checked by code
// and by `bun run e2e`. Needs Supabase and the dev server; about 25 cents of
// Sonnet a run.
//
//   bun scripts/principles.ts [label]

import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { Temporal } from "temporal-polyfill";
import { bodyClockOf } from "../src/modules/arrange/core/body-clock";

const APP = "http://localhost:3000";
const TZ = "America/Los_Angeles";
const label = process.argv[2] ?? "plan";
const email = `principles-${Date.now()}@example.edu`;

const sql = (q: string) =>
  execSync(
    "docker exec -i supabase_db_project psql -U postgres -t -A -q -F'|'",
    {
      input: q,
    },
  )
    .toString()
    .trim();
const instant = (text: string) =>
  Temporal.Instant.from(
    text.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"),
  ).toZonedDateTimeISO(TZ);
const average = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

function score(heading: string) {
  const user = sql(`select id from auth.users where email='${email}'`);
  const settings = JSON.parse(
    sql(
      `select json_build_object('nights', nights, 'clock', clock) from settings where owner_id='${user}'`,
    ) || "{}",
  );
  const clock = bodyClockOf(settings);
  const sessions = sql(
    `select b.start, b.minutes, t.id, t.work, t.course, t.due from blocks b join tasks t on t.id = b.task_id
     where b.owner_id='${user}' and b.kind='session' and b.start > now() order by b.start`,
  )
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [start, minutes, task, work, course, due] = row.split("|");
      const at = instant(start);
      return {
        at,
        end: at.add({ minutes: Number(minutes) }),
        minutes: Number(minutes),
        task,
        work,
        course,
        due: instant(due),
      };
    });
  type Session = (typeof sessions)[number];
  const alertness = (s: Session) => {
    let sum = 0;
    for (let m = 0; m < s.minutes; m += 5)
      sum += clock.hours[s.at.add({ minutes: m }).hour];
    return sum / Math.ceil(s.minutes / 5);
  };
  const deep = sessions.filter((s) => s.work === "deep");
  const light = sessions.filter((s) => s.work === "light");

  const byTask = new Map<string, Session[]>();
  for (const s of sessions)
    byTask.set(s.task, [...(byTask.get(s.task) ?? []), s]);
  const long = [...byTask.values()].filter(
    (ss) =>
      ss.reduce((a, s) => a + s.minutes, 0) > 90 &&
      ss[0].at.toPlainDate().until(ss[0].due.toPlainDate()).days >= 2,
  );
  const spread = long.filter(
    (ss) => new Set(ss.map((s) => s.at.toPlainDate().toString())).size >= 2,
  ).length;

  let pairs = 0;
  let tight = 0;
  let sameTask = 0;
  let courseChanges = 0;
  for (let i = 1; i < sessions.length; i++) {
    const a = sessions[i - 1];
    const b = sessions[i];
    if (!a.at.toPlainDate().equals(b.at.toPlainDate())) continue;
    pairs++;
    const gap = (b.at.epochMilliseconds - a.end.epochMilliseconds) / 60_000;
    if (gap < 10) tight++;
    if (a.task === b.task && gap < 30) sameTask++;
    if (a.course !== b.course) courseChanges++;
  }
  const asleep = ((clock.asleep % 1440) + 1440) % 1440;
  const windDown = deep.filter((s) => {
    const end = s.end.hour * 60 + s.end.minute;
    return (asleep - end + 1440) % 1440 < 60;
  }).length;
  const lengths = sessions.map((s) => s.minutes);
  // Stretches: sessions less than 30 minutes apart, as the planner counts them.
  const stretches: number[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const before = sessions[i - 1];
    const gap = before
      ? (sessions[i].at.epochMilliseconds - before.end.epochMilliseconds) /
        60_000
      : Number.POSITIVE_INFINITY;
    if (gap < 30) stretches[stretches.length - 1] += sessions[i].minutes;
    else stretches.push(sessions[i].minutes);
  }

  console.log(
    `\n${heading}: ${sessions.length} sessions, ${average(lengths)} min on average (${Math.min(...lengths)}–${Math.max(...lengths)})`,
  );
  console.log(
    `  synchrony   deep work's average alertness ${average(deep.map(alertness))} vs light work's ${average(light.map(alertness))} (of 100)`,
  );
  console.log(
    `  spreading   ${spread} of ${long.length} long tasks (over 90 min, due 2+ days out) on 2+ days`,
  );
  console.log(
    `  breaks      ${tight} of ${pairs} back-to-back pairs less than 10 min apart`,
  );
  console.log(
    `  same task   ${sameTask} pairs of the same task under 30 min apart`,
  );
  console.log(`  courses     ${courseChanges} of ${pairs} pairs change course`);
  console.log(
    `  wind-down   ${windDown} deep sessions ending in the hour before sleep`,
  );
  console.log(
    `  pacing      ${stretches.filter((m) => m > 90).length} of ${stretches.length} stretches of work over 90 min (longest ${Math.max(...stretches)} min)`,
  );
  const startsAt = sessions.map(
    (s) => `${s.at.hour}:${String(s.at.minute).padStart(2, "0")}`,
  );
  console.log(
    `  variety     ${new Set(startsAt).size} different start times across ${sessions.length} sessions`,
  );
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(`${APP}/login`);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Passphrase").fill(process.env.ACCESS_CODE ?? "");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/day/);
const user = sql(`select id from auth.users where email='${email}'`);
// A late sleeper (about 1:30am to 9:30am), so the body clock matters.
sql(`insert into settings (owner_id, time_zone, nights) values ('${user}', '${TZ}',
  (select jsonb_agg(jsonb_build_object('date', to_char(current_date - i, 'YYYY-MM-DD'),
    'asleep', 75 + (i % 3) * 15, 'up', 555 + (i % 2) * 30)) from generate_series(0, 13) i))
  on conflict (owner_id) do update set nights = excluded.nights, time_zone = excluded.time_zone;`);

const started = Date.now();
for (const school of ["state", "college"])
  await page.evaluate(
    async (url) =>
      (
        await fetch("/api/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: { kind: "link", url },
            timeZone: "America/Los_Angeles",
          }),
        })
      ).json(),
    `${APP}/mock/${school}.ics`,
  );
for (let i = 0; i < 400; i++) {
  const waiting = sql(
    `select count(*) from feeds where owner_id='${user}' and (planned_at is null or planned_at < imported_at)`,
  );
  if (waiting === "0") break;
  await new Promise((wait) => setTimeout(wait, 1000));
}
console.log(
  `import, reading and the plan on import took ${Math.round((Date.now() - started) / 1000)}s`,
);
score(`${label}, planned on import`);

const weekStarted = Date.now();
const week = await page.evaluate(async () => {
  const response = await fetch("/api/reschedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "week" }),
  });
  return { status: response.status, body: await response.json() };
});
console.log(
  `\nReschedule → Week: ${week.status} in ${Math.round((Date.now() - weekStarted) / 1000)}s, ${week.body.placed} placed, ${week.body.unplaced} min didn't fit`,
);
score(`${label}, Reschedule → Week`);
await browser.close();
