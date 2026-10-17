// Browser UI pass: bun scripts/e2e-ui.ts  (dev server + Supabase running)
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = process.env.UI_OUT ?? `${process.cwd()}/.e2e-ui`; // screenshots + console log, not committed
mkdirSync(OUT, { recursive: true });
const TZ = "America/Los_Angeles";
const STATE = `${BASE}/mock/state.ics?tz=${TZ}`;
const COLLEGE = `${BASE}/mock/college.ics?tz=${TZ}`;
const AT = "14:10";
const LONG = 90_000;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: TZ,
  locale: "en-US",
  geolocation: { latitude: 37.3195, longitude: -122.0448 },
  permissions: ["geolocation"],
});
await context.addInitScript(() => {
  const w = window as unknown as { __extensionLog: unknown[] };
  w.__extensionLog = w.__extensionLog ?? [];
  window.addEventListener("message", (event) => {
    const d = event.data;
    if (d?.source !== "planner") return;
    w.__extensionLog.push(d);
    const result =
      d.type === "activity"
        ? {
            hours: [
              45, 20, 6, 3, 2, 2, 3, 8, 30, 55, 68, 72, 60, 58, 70, 78, 80, 65,
              50, 72, 85, 82, 70, 60,
            ],
            // A late sleeper: about 1:30am to 9:30am, two weeks of nights.
            nights: Array.from({ length: 14 }, (_, i) => {
              const day = new Date(Date.now() - i * 86_400_000);
              const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
              return {
                date,
                asleep: 75 + (i % 3) * 15,
                up: 555 + (i % 2) * 30,
              };
            }),
          }
        : { ok: true };
    window.postMessage(
      { source: "planner-extension", id: d.id, result },
      location.origin,
    );
  });
});
const page = await context.newPage();

let current = "start";
const problems = new Map<string, string>();
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    problems.set(`${m.type()}: ${m.text().slice(0, 300)}`, current);
    appendFileSync(
      `${OUT}/console.log`,
      `[${current}] ${page.url()}\n${m.text()}\n\n`,
    );
  }
});
page.on("pageerror", (e) =>
  problems.set(`pageerror: ${e.message.slice(0, 300)}`, current),
);

const results: string[] = [];
const notes: string[] = [];
let shot = 0;
async function snap(name: string) {
  shot++;
  const file = `${OUT}/${String(shot).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}
async function flow(name: string, fn: () => Promise<void>) {
  current = name;
  const t = Date.now();
  try {
    await fn();
    const s = ((Date.now() - t) / 1000).toFixed(1);
    results.push(`PASS ${name} (${s}s)`);
    await snap(name.replace(/\W+/g, "-"));
  } catch (e) {
    const f = await snap(`FAIL-${name.replace(/\W+/g, "-")}`);
    results.push(
      `FAIL ${name}: ${String(e).split("\n")[0].slice(0, 300)} [${f}]`,
    );
    await page.keyboard.press("Escape").catch(() => {});
  }
}
function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assert: ${msg}`);
}
const day = (extra = "") => `${BASE}/day?at=${AT}${extra}`;
// The newest card: a closing one can still be fading out.
const popover = () => page.locator(".rt-PopoverContent").last();
// Blocks carry data-kind: session, break, event, nature, due.
const blockBtn = (kind: string) =>
  page.locator(
    kind === "block"
      ? "button[data-kind]:not([data-kind=due])"
      : `button[data-kind="${kind}"]`,
  );

// tomorrow in LA
const tomorrow = (() => {
  const d = new Date(Date.now() + 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
})();

const stateIcs = await (await fetch(STATE)).text();
writeFileSync(`${OUT}/state.ics`, stateIcs);

const EMAIL = `ui-${Date.now()}@example.edu`;
let placesFound = false;

await flow("0 login", async () => {
  await page.goto(day());
  await page.waitForURL(/\/login\?next=/);
  await snap("login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Passphrase").fill(process.env.ACCESS_CODE ?? "");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/day\?at=/, { timeout: 30000 });
});

await flow("1 options", async () => {
  // A first visit with no schools shows the Canvas import right on Day.
  await page.getByLabel("Canvas feed link").waitFor({ timeout: 15000 });
  await page.getByRole("link", { name: "Options" }).click();
  await page.waitForURL(/\/options/);
  const dlg = page.locator("main");
  ok(
    await dlg.getByRole("heading", { name: "Options" }).isVisible(),
    "Options is a page",
  );
  const link = dlg.getByLabel("Canvas feed link");
  await link.fill(STATE);
  await dlg.getByRole("button", { name: "Add", exact: true }).click();
  await dlg.getByText(/\d+ upcoming/).waitFor({ timeout: LONG });
  notes.push(
    `state result: ${await dlg.getByText(/\d+ upcoming/).innerText()}`,
  );
  // The model reads in the background: a progress bar and "Reading n of N".
  await dlg.getByRole("progressbar").first().waitFor({ timeout: 10000 });
  notes.push(
    `while reading: ${await dlg
      .getByText(/Reading \d+ of \d+/)
      .first()
      .innerText()}`,
  );
  await snap("options-reading");
  await dlg.getByText(/\d+ assignments · link/).waitFor({ timeout: LONG });
  await snap("options-state-added");
  await link.fill(COLLEGE);
  await dlg.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes("canvas.mockcollege.edu"),
    null,
    { timeout: LONG },
  );
  await dlg
    .getByText(/canvas\.mockcollege\.edu/)
    .first()
    .waitFor();
  // The college has 4 entries, one of them a morning quiz that is already past
  // after 9:30am, so its count depends on the hour: wait for both rows to settle.
  await page.waitForFunction(
    () =>
      (document.body.innerText.match(/\d+ assignments · (link|file)/g) ?? [])
        .length === 2,
    null,
    { timeout: LONG },
  );
  notes.push(
    `after college: ${await dlg.getByText(/\d+ upcoming/).innerText()}`,
  );
  // upload
  await dlg.locator("input[type=file]").setInputFiles(`${OUT}/state.ics`);
  await page.waitForTimeout(500);
  await page
    .waitForFunction(
      () => !document.querySelector('[class*="rt-Spinner"]'),
      null,
      { timeout: LONG },
    )
    .catch(() => {});
  await dlg
    .getByText(/mockstate\.instructure\.com · \d+ upcoming/)
    .first()
    .waitFor({ timeout: LONG })
    .catch(() => {});
  await page.waitForFunction(
    () => !/Reading \d+ of/.test(document.body.innerText),
    null,
    { timeout: LONG },
  );
  const rows = await dlg.getByText(/assignments ·/).allInnerTexts();
  notes.push(`school rows after upload: ${JSON.stringify(rows)}`);
  ok(rows.length === 2, `2 school rows, got ${rows.length}`);
  notes.push(
    `upload result line: ${await dlg
      .locator("span")
      .filter({ hasText: /\d+ upcoming/ })
      .last()
      .innerText()
      .catch(() => "none")}`,
  );
  // hours
  ok(
    (await dlg
      .locator('[role=img][aria-label="Alertness by hour"] > span')
      .count()) === 24,
    "24 hour bars",
  );
  await dlg
    .getByText(/From your browser, 14 nights/)
    .waitFor({ timeout: 10000 });
  ok(
    await dlg.getByText(/Late type/).isVisible(),
    "the body clock reads a late type from the nights",
  );
  ok(
    await dlg.getByText("Extension connected").isVisible(),
    "the extension shows as connected",
  );
  ok(
    !(await dlg.getByRole("button", { name: "Find near me" }).count()),
    "no Places section: places are found on Reschedule",
  );
  // remove ask + keep
  const row = dlg
    .getByText("canvas.mockcollege.edu")
    .first()
    .locator("xpath=ancestor::div[2]");
  await row.getByRole("button", { name: "Remove" }).click();
  await row.getByText("Remove this school?").waitFor({ timeout: 3000 });
  const focused = await page.evaluate(
    () => document.activeElement?.textContent,
  );
  ok(focused === "Keep", `Keep focused, got ${focused}`);
  await snap("options-remove-ask");
  await row.getByRole("button", { name: "Keep" }).click();
  await row.getByText("canvas.mockcollege.edu").waitFor();
});

await flow("2 day view", async () => {
  await page.goto(day());
  await page
    .getByRole("button", { name: "Reschedule" })
    .waitFor({ timeout: 15000 });
  const h = await page.locator("h1,h2,[class*=rt-Heading]").first().innerText();
  notes.push(`day heading: ${h.replace(/\n/g, " ")}`);
  ok(/day/.test(h) && /\d:\d\d/.test(h), "weekday + clock heading");
  ok(await page.getByText(/^Now: /).isVisible(), "Now:");
  ok(await page.getByText(/^\d+\/\d+ done/).isVisible(), "N/N done");
  ok(
    await page.getByText("Due", { exact: true }).first().isVisible(),
    "Due row",
  );
  ok((await page.locator('[class*="tick"]').count()) >= 12, "hour ticks");
  notes.push(
    `due chips: ${await page.locator('button[data-kind="due"]').count()}`,
  );
});

await flow("3 reschedule the week", async () => {
  const t = Date.now();
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  const card = popover();
  await card.getByText("What's wrong?").waitFor();
  ok(
    (await card
      .getByRole("radio", { name: "Week" })
      .getAttribute("aria-checked")) === "true" ||
      (await card.locator('[data-state="on"]').innerText()).includes("Week"),
    "nothing planned yet, so Week is chosen",
  );
  await snap("reschedule-form");
  await card.getByRole("button", { name: "Reschedule" }).click();
  await popover()
    .getByText("Rescheduling")
    .waitFor({ timeout: 5000 })
    .catch(() => notes.push("no spinner seen"));
  await popover()
    .getByText(/Planned \d+ sessions?\./)
    .waitFor({ timeout: LONG });
  notes.push(`reschedule took ${((Date.now() - t) / 1000).toFixed(0)}s`);
  ok(
    await popover().getByRole("button", { name: "Undo" }).isVisible(),
    "Undo offered",
  );
  await popover().getByText("Biggest priority").waitFor();
  const n = await popover()
    .locator("p, span")
    .filter({ hasText: /Due / })
    .count();
  ok(n >= 1 && n <= 3, `1-3 priority tasks, got ${n}`);
  await snap("reschedule-result");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const sessions = await blockBtn("block").count();
  ok(sessions > 0, "session blocks on timeline");
  // Reschedule found places near the (faked) location in the background, then
  // planned nature suggestions. OpenStreetMap is sometimes down, and today may
  // have no daylight gap left: noted, not failed.
  const waited = Date.now();
  placesFound = await blockBtn("nature")
    .first()
    .waitFor({ timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  const nature = await blockBtn("nature").allInnerTexts();
  notes.push(
    placesFound
      ? `nature after ${((Date.now() - waited) / 1000).toFixed(0)}s: ${JSON.stringify(nature.map((s) => s.replace(/\n/g, " ")))}`
      : "no nature suggestion today (no places found, or no daylight gap left)",
  );
  ok(nature.length <= 1, "at most one nature suggestion a day");
});

await flow("4 session card, done, undo", async () => {
  // find a visible session block (has .sub course text)
  const sess = page.locator('button[data-kind="session"]').first();
  await sess.scrollIntoViewIfNeeded();
  await sess.click();
  const p = popover();
  await p.waitFor();
  for (const t of ["Open in Canvas", "Focus", "Done", "Reschedule"])
    ok(
      await p.getByText(t, { exact: true }).first().isVisible(),
      `card has ${t}`,
    );
  notes.push(`session card: ${(await p.innerText()).replace(/\n/g, " | ")}`);
  await snap("session-card");
  await p.getByRole("button", { name: "Done" }).click();
  await p.getByRole("button", { name: "Undo" }).waitFor({ timeout: 5000 });
  await page.keyboard.press("Escape");
  const doneCls = await sess.getAttribute("class");
  ok(/done/.test(doneCls ?? ""), "block has done class");
  ok(await page.getByText(/^1\/\d+ done/).isVisible(), "1/N done");
  await snap("session-done");
  await sess.click();
  await popover().getByRole("button", { name: "Undo" }).click();
  await popover().getByRole("button", { name: "Done" }).waitFor();
  await page.keyboard.press("Escape");
  ok(await page.getByText(/^0\/\d+ done/).isVisible(), "back to 0/N done");
});

await flow("4b reschedule from a session + nap", async () => {
  const sess = page.locator('button[data-kind="session"]').first();
  await sess.click();
  await popover().getByRole("button", { name: "Reschedule" }).click();
  await popover().getByText("What's wrong?").waitFor();
  ok(
    (await popover().locator('[data-state="on"]').innerText()).includes("Day"),
    "from a session, Day is chosen",
  );
  const f = await page.evaluate(() => document.activeElement?.id);
  ok(f === "whats-wrong", `text field focused, got ${f}`);
  await snap("whats-wrong");
  await page.keyboard.type("so sleepy I can't keep my eyes open");
  const t = Date.now();
  await popover().getByRole("button", { name: "Reschedule" }).click();
  await popover()
    .getByText(/Nap for \d+ minutes/)
    .waitFor({ timeout: LONG });
  notes.push(
    `from-session result: ${(await popover().innerText()).replace(/\n/g, " | ")}`,
  );
  await page
    .locator('button[data-kind="break"]')
    .first()
    .waitFor({ timeout: LONG });
  notes.push(
    `reschedule from a session took ${((Date.now() - t) / 1000).toFixed(0)}s`,
  );
  await page.keyboard.press("Escape");
  const txt = (
    await page.locator('button[data-kind="break"]').first().innerText()
  ).replace(/\n/g, " ");
  notes.push(`break block: ${txt}`);
  ok(/nap/i.test(txt), "Nap break");
  await page.locator('button[data-kind="break"]').first().click();
  notes.push(
    `break card: ${(await popover().innerText()).replace(/\n/g, " | ")}`,
  );
  await snap("nap-card");
  await page.keyboard.press("Escape");
});

await flow("5 due chip", async () => {
  const chip = page.locator('button[data-kind="due"]').first();
  await chip.click();
  const p = popover();
  await p.getByText(/^Due /).waitFor();
  await p.getByRole("checkbox").click();
  await page.waitForTimeout(500);
  ok(await p.getByRole("checkbox").isChecked(), "checkbox ticked");
  await snap("due-card");
  await page.keyboard.press("Escape");
  ok(/done/.test((await chip.getAttribute("class")) ?? ""), "chip done style");
});

await flow("6 nature card", async () => {
  if (!placesFound) {
    notes.push("nature card skipped: no nature suggestion today");
    return;
  }
  await blockBtn("nature").first().click();
  const p = popover();
  await p.locator(".leaflet-container").waitFor({ timeout: 15_000 });
  ok(await p.getByText(/min walk each way/).isVisible(), "the walk each way");
  ok(
    /fossgis_osrm_foot/.test(
      (await p
        .getByRole("link", { name: "Directions" })
        .getAttribute("href")) ?? "",
    ),
    "Directions on foot",
  );
  notes.push(`nature card: ${(await p.innerText()).replace(/\n/g, " | ")}`);
  await snap("nature-card");
  await page.keyboard.press("Escape");
});

await flow("7 add event/edit/delete", async () => {
  await page.getByRole("button", { name: "Add block" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Title").fill("Work");
  await dlg.getByLabel("Date").fill(tomorrow);
  await dlg.getByLabel("Start").fill("16:00");
  await dlg.getByLabel("End").fill("20:00");
  await snap("add-dialog");
  await dlg.getByRole("button", { name: "Save" }).click();
  await dlg.waitFor({ state: "detached" });
  await page.goto(`${BASE}/week?at=${AT}&date=${tomorrow}`);
  await page.getByRole("columnheader").first().waitFor();
  await page
    .getByText("Work", { exact: true })
    .first()
    .waitFor({ timeout: 10000 });
  await snap("week-with-work");
  await page.goto(day(`&date=${tomorrow}`));
  const ev = blockBtn("event").filter({ hasText: "Work" }).first();
  await ev.waitFor({ timeout: 10000 });
  await ev.click();
  await popover().getByRole("button", { name: "Edit" }).click();
  await popover().getByLabel("Title").fill("Work shift");
  await page.keyboard.press("Escape");
  await popover().getByText("Save changes?").waitFor({ timeout: 3000 });
  await snap("save-changes");
  await popover().getByRole("button", { name: "Save", exact: true }).click();
  await blockBtn("event")
    .filter({ hasText: "Work shift" })
    .waitFor({ timeout: 5000 });
  // The card stays open after saving; close it before opening it again.
  await page.keyboard.press("Escape");
  await popover().waitFor({ state: "detached", timeout: 5000 });
  // The shift covers planned work, so Reschedule runs by itself and moves just that work.
  await page
    .getByRole("button", { name: "Reschedule" })
    .and(page.locator("[data-disabled]"))
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  await page
    .waitForFunction(
      () => !document.querySelector("button[data-disabled] .rt-Spinner"),
      null,
      { timeout: LONG },
    )
    .catch(() => {});
  const [shiftStart, shiftEnd] = [16 * 60, 20 * 60];
  const clashes = await blockBtn("session").evaluateAll(
    (els, [a, b]) =>
      els.filter((el) => {
        const m = /(\d+):(\d\d)(am|pm)–(\d+):(\d\d)(am|pm)/.exec(
          el.textContent ?? "",
        );
        if (!m) return false;
        const t = (h: string, mm: string, ap: string) =>
          ((+h % 12) + (ap === "pm" ? 12 : 0)) * 60 + +mm;
        return t(m[1], m[2], m[3]) < b && a < t(m[4], m[5], m[6]);
      }).length,
    [shiftStart, shiftEnd],
  );
  ok(clashes === 0, `no session left under the shift (${clashes})`);
  await snap("shift-rearranged");
  await blockBtn("event").filter({ hasText: "Work shift" }).click();
  await popover().getByRole("button", { name: "Delete" }).click();
  await popover().getByText("Delete this?").waitFor();
  ok(
    (await page.evaluate(() => document.activeElement?.textContent)) === "Keep",
    "Keep focused",
  );
  await snap("delete-ask");
  await popover()
    .getByRole("button", { name: "Delete", exact: true })
    .last()
    .click();
  await page.waitForTimeout(800);
  ok(
    (await blockBtn("event").filter({ hasText: "Work shift" }).count()) === 0,
    "event deleted",
  );
  await page.keyboard.press("Escape");
});

await flow("9 day navigation", async () => {
  await page.goto(day());
  await page.getByLabel("Next day").click();
  await page.waitForURL(/date=/);
  const n = new URL(page.url()).searchParams.get("date");
  await page.getByLabel("Next day").click();
  await page.waitForFunction(
    (p) => new URL(location.href).searchParams.get("date") !== p,
    n,
  );
  await page.getByLabel("Previous day").click();
  await page.waitForFunction(
    (p) => new URL(location.href).searchParams.get("date") === p,
    n,
  );
  await snap("day-next");
  await page.getByRole("button", { name: "Today" }).click();
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.get("date"),
  );
  notes.push(`nav dates ok, first next = ${n}; at= kept: ${page.url()}`);
});

await flow("10 week", async () => {
  await page.goto(`${BASE}/week?at=${AT}`);
  await page.getByRole("columnheader").first().waitFor();
  const heads = await page.getByRole("columnheader").allInnerTexts();
  notes.push(
    `week headers: ${JSON.stringify(heads.slice(0, 9).map((s) => s.replace(/\n/g, " ")))}`,
  );
  ok(/Sun/.test(heads.join(" ")), "has Sun");
  ok(
    heads.join(" ").search(/Sun/) < heads.join(" ").search(/Mon/),
    "Sunday first",
  );
  ok(
    await page.getByText("Due", { exact: true }).first().isVisible(),
    "Due all-day row",
  );
  const b = blockBtn("block")
    .filter({ hasNot: page.locator("x") })
    .first();
  await b.click();
  await popover().waitFor();
  notes.push(
    `week card: ${(await popover().innerText()).replace(/\n/g, " | ").slice(0, 150)}`,
  );
  await page.keyboard.press("Escape");
  const label = await page
    .locator("h1,h2,[class*=rt-Heading]")
    .first()
    .innerText();
  await page.getByLabel("Next week").click();
  await page.waitForFunction(
    (l) => document.querySelector("[class*=rt-Heading]")?.textContent !== l,
    label,
  );
  await page.getByLabel("Previous week").click();
  await page.getByRole("button", { name: "Today" }).click();
  await page.waitForFunction(
    (l) => document.querySelector("[class*=rt-Heading]")?.textContent === l,
    label,
  );
});

await flow("11 focus", async () => {
  await page.goto(day());
  // Focus is per task: no sidebar link, only a session's card.
  ok(
    !(await page.locator("nav").getByRole("link", { name: "Focus" }).count()),
    "no Focus in the sidebar",
  );
  await blockBtn("session").first().click();
  await popover().getByRole("link", { name: "Focus" }).click();
  await page.waitForURL(/\/focus\//);
  await page
    .getByText(/^\d+:00$/)
    .first()
    .waitFor();
  ok(await page.getByText(/^Focus 1 of \d+$/).isVisible(), "Focus 1 of N");
  await snap("focus-before");
  // Lockdown is a setting in Options; focus mode only tells the extension.
  ok(
    !(await page.getByRole("switch").count()),
    "focus mode has no Lockdown switch",
  );
  const first = await page.locator('[class*="clock"]').first().innerText();
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(2500);
  const clock = await page.locator('[class*="clock"]').first().innerText();
  ok(clock.trim() !== first.trim(), `clock counts down, got ${clock}`);
  const log = await page.evaluate(() =>
    (
      window as unknown as { __extensionLog: { type: string }[] }
    ).__extensionLog.map((m) => m.type),
  );
  ok(log.includes("focus"), `focus logged, log=${JSON.stringify(log)}`);
  await page.getByRole("button", { name: "Sound on" }).click();
  await page.locator("iframe[title=Lofi]").waitFor();
  await snap("focus-running");
  await page.getByRole("button", { name: "Leave" }).click();
  await page.waitForURL(/\/day/);
  const log2 = await page.evaluate(() =>
    (
      window as unknown as { __extensionLog: { type: string }[] }
    ).__extensionLog.map((m) => m.type),
  );
  ok(log2.includes("unfocus"), `unfocus logged, log=${JSON.stringify(log2)}`);
});

await flow("12 remove college", async () => {
  await page.goto(day());
  const before = await page.locator('button[data-kind="due"]').count();
  await page.goto(`${BASE}/options?at=${AT}`);
  const dlg = page.locator("main");
  const row = dlg
    .getByText("canvas.mockcollege.edu")
    .first()
    .locator("xpath=ancestor::div[2]");
  await row.getByRole("button", { name: "Remove" }).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await dlg
    .getByText("canvas.mockcollege.edu")
    .waitFor({ state: "detached", timeout: 10000 });
  await snap("removed");
  await page.goto(day());
  const fetched = await page.evaluate(() =>
    document.body.innerText.includes("Spanish Homework"),
  );
  ok(!fetched, "no college text left");
  notes.push(
    `due chips before/after: ${before}/${await page.locator('button[data-kind="due"]').count()}`,
  );
});

await flow("look checks", async () => {
  await page.goto(day());
  await page.getByRole("button", { name: "Reschedule" }).waitFor();
  await blockBtn("block").first().click();
  const info = await page.evaluate(() => {
    const p = document.querySelector(
      ".rt-PopoverContent",
    ) as HTMLElement | null;
    const cs = p ? getComputedStyle(p) : null;
    const grads = [...document.querySelectorAll("*")].filter((e) =>
      getComputedStyle(e).backgroundImage.includes("gradient"),
    ).length;
    return {
      shadow: cs?.boxShadow,
      border: cs?.border,
      grads,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  notes.push(`popover style: ${JSON.stringify(info)}`);
  await page.keyboard.press("Escape");
});

await flow("13 sign out", async () => {
  await page.goto(`${BASE}/options`);
  const dlg = page.locator("main");
  ok(await dlg.getByText(EMAIL).isVisible(), "Options shows the email");
  await dlg.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto(`${BASE}/week`);
  await page.waitForURL(/\/login\?next=%2Fweek/);
});

await flow("14 without the extension", async () => {
  // A second student with no extension: nothing asks for it, and it all still works.
  const plain = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: TZ,
    locale: "en-US",
  });
  const other = await plain.newPage();
  other.on("pageerror", (e) =>
    problems.set(`pageerror: ${e.message.slice(0, 300)}`, current),
  );
  await other.goto(`${BASE}/login`);
  await other.getByLabel("Email").fill(`plain-${Date.now()}@example.edu`);
  await other.getByLabel("Passphrase").fill(process.env.ACCESS_CODE ?? "");
  await other.getByRole("button", { name: "Continue" }).click();
  await other.waitForURL(/\/day/);
  await other.goto(`${BASE}/options`);
  await other.getByText("Extension not connected").waitFor({ timeout: 10000 });
  ok(
    (await other.getByText(/^Default$/).isVisible()) &&
      (await other.getByText(/Up around 8am, asleep around 11pm/).isVisible()),
    "the default body clock shown",
  );
  await other.getByLabel("Canvas feed link").fill(STATE);
  await other.getByRole("button", { name: "Add", exact: true }).click();
  await other.getByText(/\d+ assignments · link/).waitFor({ timeout: LONG });
  await other.goto(`${BASE}/day?at=${AT}`);
  await other.getByRole("button", { name: "Reschedule", exact: true }).click();
  await other
    .locator(".rt-PopoverContent")
    .last()
    .getByRole("button", { name: "Reschedule" })
    .click();
  await other.getByText(/Planned \d+ sessions?\./).waitFor({ timeout: LONG });
  await other.keyboard.press("Escape");
  const first = other.locator('button[data-kind="session"]').first();
  await first.click();
  await other
    .locator(".rt-PopoverContent")
    .last()
    .getByRole("link", { name: "Focus" })
    .click();
  await other.waitForURL(/\/focus\//);
  await other.getByRole("button", { name: "Start" }).waitFor();
  ok(
    !(await other.getByText("Lockdown").isVisible()),
    "focus mode doesn't mention Lockdown",
  );
  await other.screenshot({ path: `${OUT}/no-extension-focus.png` });
  await plain.close();
});

console.log(results.join("\n"));
console.log(`\nNOTES\n${notes.join("\n")}`);
console.log("\nCONSOLE/PAGE PROBLEMS");
for (const [k, v] of problems) console.log(`[${v}] ${k}`);
await browser.close();
