// Optional: the app works without it. When present it unlocks usage-pattern
// learning (active hours and nights from browser history, handed to the
// planner) and Lockdown. With Lockdown on in Options, distractions are blocked
// while a session is under way by the plan, or while focus mode runs (perhaps
// on a task ahead of its time). Each site opened then is judged once (study or
// distraction, by Haiku through the app).
import { activeHours, sleepTimes } from "./activity.js";

const DAYS = 28;
const BLOCK_RULE = 1;
// The app online; a local one is learned from its own messages.
const DEFAULT_APP = "https://dahacksproj.vercel.app";
const BLOCKED = chrome.runtime.getURL("blocked.html");
const VERDICTS = ["study", "distraction", "unsure"];
const FROM_APP = new Set(["ping", "activity", "focus", "unfocus", "sync"]);
const POLL_MINUTES = 1;

// chrome.storage.local:
//   appOrigin  where the app was last seen
//   demoAt     the app's pinned demo clock ("14:10"), or null
//   verdicts   {host: verdict}, kept for good
//   focus      {until, id, tab, title, course}: focus mode running, from the app
//   remote     {on, session}: the setting and the session under way, from
//              the app's /api/lockdown; null when the app couldn't be reached
//   lockdown   {until, title, course}: what's blocking now (derived), or null
// chrome.storage.session: passed ({host: true}), sites let through for this
// Lockdown because they couldn't be asked about.

async function stored(key, fallback) {
  const value = (await chrome.storage.local.get(key))[key];
  return value ?? fallback;
}

const appOrigin = () => stored("appOrigin", DEFAULT_APP);

/**
 * The Lockdown running now, or null: the setting is on, and focus mode is
 * running or a session is under way. It lasts until the later of the two
 * ends, and shows the focus session when there is one.
 */
async function currentLockdown() {
  const remote = await stored("remote", null);
  if (!remote?.on) return null;
  const now = Date.now();
  const live = (x) => (x && Date.parse(x.until) > now ? x : null);
  const focus = live(await stored("focus", null));
  const session = live(remote.session);
  const shown = focus ?? session;
  if (!shown) return null;
  const until = Math.max(
    ...[focus, session].filter(Boolean).map((x) => Date.parse(x.until)),
  );
  return {
    until: new Date(until).toISOString(),
    id: shown.id ?? null,
    title: shown.title,
    course: shown.course,
  };
}

/** "youtube.com" from a page address; null for anything that isn't a website. */
function hostOf(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return null;
    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** This computer and the local network are never judged. */
function local(host) {
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  );
}

async function readActivity() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (DAYS - 1));
  const startTime = since.getTime();
  const pages = await chrome.history.search({
    text: "",
    startTime,
    maxResults: 100000,
  });
  const visits = await Promise.all(
    pages.map((page) => chrome.history.getVisits({ url: page.url })),
  );
  const times = visits
    .flat()
    .filter((visit) => visit.visitTime >= startTime && visit.isLocal !== false)
    .map((visit) => visit.visitTime);
  return {
    days: DAYS,
    hours: activeHours(times, DAYS),
    nights: sleepTimes(times, DAYS),
    saved: new Date().toISOString(),
  };
}

// ---------- Lockdown ----------

/** Distractions already known are sent to the blocked page before they load. */
async function refreshRule() {
  const lockdown = await currentLockdown();
  const verdicts = await stored("verdicts", {});
  const hosts = Object.keys(verdicts).filter(
    (host) => verdicts[host] === "distraction",
  );
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCK_RULE],
    addRules:
      lockdown && hosts.length
        ? [
            {
              id: BLOCK_RULE,
              priority: 1,
              action: {
                type: "redirect",
                redirect: { regexSubstitution: `${BLOCKED}?url=\\0` },
              },
              condition: {
                regexFilter: "^https?://.*",
                requestDomains: hosts,
                resourceTypes: ["main_frame"],
              },
            },
          ]
        : [],
  });
}

/**
 * Brings the blocking in line with currentLockdown(): the rule, the stored
 * `lockdown` the blocked page and popup watch, and an alarm for its end.
 * Lifting removes the rule first, so a blocked tab that moves on isn't caught
 * again on its way.
 */
async function apply() {
  const next = await currentLockdown();
  const before = await stored("lockdown", null);
  if (!next) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [BLOCK_RULE],
    });
    await chrome.alarms.clear("lift");
    if (before) {
      await chrome.storage.local.set({ lockdown: null });
      await chrome.storage.session.set({ passed: {} });
    }
    return;
  }
  if (!before) await chrome.storage.session.set({ passed: {} });
  if (JSON.stringify(next) !== JSON.stringify(before))
    await chrome.storage.local.set({ lockdown: next });
  await refreshRule();
  await chrome.alarms.create("lift", { when: Date.parse(next.until) });
  if (!before) void sweep();
}

/**
 * When Lockdown starts, tabs already open on a distraction are blocked too.
 * Sites not judged yet are asked about in the background, and their tabs are
 * only touched if the answer is a distraction, so a study tab never reloads.
 */
async function sweep() {
  const app = await appOrigin();
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    const host = hostOf(tab.url);
    if (!host || local(host) || new URL(tab.url).origin === app) continue;
    void judge(host).then(async (verdict) => {
      if (verdict === "distraction") await toFocus(tab.id, { swept: true });
    });
  }
}

// When a tab got to bounce last, so a tab going back onto another
// distraction closes instead of going back again.
const bounced = new Map();

/**
 * Where a blocked visit goes: the app's own focus page for the session. If a
 * focus page is already open, it comes forward and the tab goes back to where
 * it was (or closes: a tab that was new, swept, or just bounced).
 */
async function toFocus(tabId, { swept = false } = {}) {
  const lockdown = await currentLockdown();
  if (!lockdown) return { sent: false };
  const app = await appOrigin();
  const at = await stored("demoAt", null);
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  const page = lockdown.id ? `focus/${lockdown.id}` : "day";
  const [open] = await chrome.tabs.query({ url: `${app}/focus/*` });
  if (!open || open.id === tabId) {
    await chrome.tabs.update(tabId, { url: `${app}/${page}${query}` });
    return { sent: true };
  }
  await chrome.tabs.update(open.id, { active: true });
  await chrome.windows.update(open.windowId, { focused: true });
  const recent = Date.now() - (bounced.get(tabId) ?? 0) < 3000;
  bounced.set(tabId, Date.now());
  // Going back is done by the blocked page itself (chrome.tabs.goBack can't
  // find the entry from there); the tab closes when it has nowhere to go.
  const { seen = {} } = await chrome.storage.session.get("seen");
  if (!swept && !recent && seen[tabId]) return { sent: true, back: true };
  await chrome.tabs.remove(tabId).catch(() => {});
  return { sent: true };
}

// Tabs that have shown a real page, so a blocked visit has somewhere to go back to.
chrome.webNavigation.onCommitted.addListener(
  async ({ tabId, frameId, url }) => {
    if (frameId !== 0 || !hostOf(url)) return;
    const { seen = {} } = await chrome.storage.session.get("seen");
    if (!seen[tabId])
      await chrome.storage.session.set({ seen: { ...seen, [tabId]: true } });
  },
);
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { seen = {} } = await chrome.storage.session.get("seen");
  if (seen[tabId]) {
    delete seen[tabId];
    await chrome.storage.session.set({ seen });
  }
});

/** "14:10" when the app is on a pinned demo clock; null otherwise. */
const demoClock = (at) =>
  typeof at === "string" && /^\d{1,2}:\d{2}$/.test(at) ? at : null;

/** A session from /api/lockdown, timed from now by its seconds left. */
function sessionFrom(session) {
  if (
    !session ||
    typeof session.title !== "string" ||
    !(Number.isFinite(session.left) && session.left > 0)
  )
    return null;
  return {
    until: new Date(Date.now() + session.left * 1000).toISOString(),
    id: typeof session.id === "string" ? session.id : null,
    title: session.title.slice(0, 200),
    course:
      typeof session.course === "string" ? session.course.slice(0, 200) : null,
  };
}

/** Asks the app for the setting and the session under way, then applies. */
async function poll() {
  let remote = null;
  try {
    const at = await stored("demoAt", null);
    const query = at ? `?at=${encodeURIComponent(at)}` : "";
    const response = await fetch(`${await appOrigin()}/api/lockdown${query}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(`lockdown ${response.status}`);
    const body = await response.json();
    remote = { on: body.on === true, session: sessionFrom(body.session) };
  } catch {
    // Fail open: unreachable or signed out, so nothing is blocked.
  }
  await chrome.storage.local.set({ remote });
  await apply();
}

// One change at a time, so polls, focus and the end alarm don't race.
let queue = Promise.resolve();
function serial(step) {
  const run = queue.then(step);
  queue = run.catch(() => {});
  return run;
}

// Closing the focus page ends focus mode, as Leave would.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const focus = await stored("focus", null);
  if (focus?.tab !== tabId) return;
  await chrome.storage.local.set({ focus: null });
  void serial(poll);
});

/** What the popup shows: the setting, and what's blocking now. */
async function lockdownState() {
  const remote = await stored("remote", null);
  return { on: remote?.on === true, lockdown: await currentLockdown() };
}

// Every minute, and when a Lockdown would end (a next session may follow).
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll" || alarm.name === "lift") void serial(poll);
});
function start() {
  void chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES });
  void serial(poll);
}
chrome.runtime.onStartup.addListener(start);
chrome.runtime.onInstalled.addListener(start);
void chrome.alarms.get("poll").then((alarm) => {
  if (!alarm) start();
});

// Only whole-page visits are judged, so a lofi player embedded in the app
// still plays. A site not judged yet goes to the blocked page first, which
// asks about it and then sends the tab on or shows the block.
chrome.webNavigation.onBeforeNavigate.addListener(
  async ({ tabId, frameId, url }) => {
    if (frameId !== 0 || tabId < 0) return;
    const host = hostOf(url);
    if (!host || local(host)) return;
    if (!(await currentLockdown())) return;
    if (new URL(url).origin === (await appOrigin())) return;
    // Known sites: studies and unsure ones pass; distractions meet the rule.
    if ((await stored("verdicts", {}))[host]) return;
    const { passed = {} } = await chrome.storage.session.get("passed");
    if (passed[host]) return;
    await chrome.tabs
      .update(tabId, { url: `${BLOCKED}?check=${encodeURIComponent(url)}` })
      .catch(() => {});
  },
);

const asking = new Map();

/** The site's verdict, asked of the app once ever; null when it couldn't be asked. */
function judge(host) {
  if (!asking.has(host))
    asking.set(
      host,
      ask(host).finally(() => asking.delete(host)),
    );
  return asking.get(host);
}

async function ask(host) {
  const known = (await stored("verdicts", {}))[host];
  if (known) return known;
  try {
    const response = await fetch(`${await appOrigin()}/api/site`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host }),
    });
    const { verdict } = await response.json();
    if (!response.ok || !VERDICTS.includes(verdict))
      throw new Error(`site ${response.status}`);
    const verdicts = await stored("verdicts", {});
    await chrome.storage.local.set({
      verdicts: { ...verdicts, [host]: verdict },
    });
    if (verdict === "distraction") await refreshRule();
    return verdict;
  } catch {
    // Fail open: the app is unreachable or signed out, so this site stays
    // open for the rest of this Lockdown.
    const { passed = {} } = await chrome.storage.session.get("passed");
    await chrome.storage.session.set({ passed: { ...passed, [host]: true } });
    return null;
  }
}

// ---------- The connection with the app ----------

/** Whether the app answers, and who's signed in to it here. */
async function status() {
  const app = await appOrigin();
  try {
    const response = await fetch(`${app}/api/status`, {
      credentials: "include",
    });
    if (response.status === 401) return { app, state: "signed-out" };
    if (!response.ok) throw new Error(`status ${response.status}`);
    const { email } = await response.json();
    return { app, state: "connected", email };
  } catch {
    return { app, state: "unreachable" };
  }
}

/** Brings the app forward: its tab if one is open, else this tab or a new one. */
async function openApp(tabId) {
  const app = await appOrigin();
  const [tab] = await chrome.tabs.query({ url: `${app}/*` });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return true;
  }
  if (tabId !== undefined)
    await chrome.tabs.update(tabId, { url: `${app}/day` });
  else await chrome.tabs.create({ url: `${app}/day` });
  return false;
}

const text = (value) =>
  typeof value === "string" ? value.slice(0, 200) : null;

function handle(message, sender, fromPage) {
  switch (message?.type) {
    // The app asks whether the extension is here before offering what it
    // unlocks; a page load is also a good moment to check Lockdown.
    case "ping":
      void serial(poll);
      return Promise.resolve({
        ok: true,
        version: chrome.runtime.getManifest().version,
      });
    // Every app page asks for what was learned: a good moment to check Lockdown too.
    case "activity":
      void serial(poll);
      return readActivity();
    // Focus mode started or resumed: `seconds` until it would end.
    case "focus": {
      const seconds = Number.isFinite(message.seconds)
        ? message.seconds
        : typeof message.until === "string"
          ? (Date.parse(message.until) - Date.now()) / 1000
          : Number.NaN;
      if (!(seconds > 0)) return null;
      const focus = {
        until: new Date(Date.now() + seconds * 1000).toISOString(),
        id: text(message.id),
        tab: sender.tab?.id ?? null,
        title: text(message.title) ?? "Focus",
        course: text(message.course),
      };
      return chrome.storage.local
        .set({ focus })
        .then(() => serial(poll))
        .then(() => ({ ok: true }));
    }
    // Focus mode paused, done or left.
    case "unfocus":
      return chrome.storage.local
        .set({ focus: null })
        .then(() => serial(poll))
        .then(() => ({ ok: true }));
    // The setting changed in Options (or the popup opened): ask again now.
    case "sync":
      return serial(poll).then(lockdownState);
  }
  if (!fromPage) return null;
  // From the extension's own pages: the popup and the blocked page.
  switch (message.type) {
    case "status":
      return status();
    case "lockdown":
      return currentLockdown();
    case "lockdown-state":
      return lockdownState();
    case "judge": {
      const host = hostOf(message.url);
      return host ? judge(host) : Promise.resolve(null);
    }
    case "to-focus":
      return sender.tab ? toFocus(sender.tab.id) : null;
    case "close":
      return sender.tab
        ? chrome.tabs.remove(sender.tab.id).then(() => ({ ok: true }))
        : null;
    case "open":
      return openApp().then(() => ({ ok: true }));
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const fromPage = sender.url?.startsWith(chrome.runtime.getURL("")) ?? false;
  if (!fromPage) {
    // Through the content script on the app's page: remember where the app is
    // and whether it's on a pinned demo clock, before acting on the message.
    if (!sender.tab || !sender.url || !FROM_APP.has(message?.type))
      return false;
    const seen = chrome.storage.local.set({
      appOrigin: new URL(sender.url).origin,
      demoAt: demoClock(message.at),
    });
    seen
      .then(() => handle(message, sender, false))
      .then(reply, () => reply(null));
    return true;
  }
  const answer = handle(message, sender, true);
  if (!answer) return false;
  answer.then(reply, () => reply(null));
  return true;
});
