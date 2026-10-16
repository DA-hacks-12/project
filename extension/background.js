// Optional: the app works without it. When present it unlocks usage-pattern
// learning (active hours from browser history, handed to the planner) and
// Lockdown in focus mode (entertainment sites blocked while a session runs).
import { activeHours } from "./activity.js";

const DAYS = 28;
const BLOCK_RULE = 1;
const ENTERTAINMENT = [
  "youtube.com",
  "tiktok.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "facebook.com",
  "netflix.com",
  "twitch.tv",
  "hulu.com",
  "disneyplus.com",
];

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
    saved: new Date().toISOString(),
  };
}

// Only whole-page visits are blocked, so a lofi player embedded in the app still plays.
async function focusUntil(until) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCK_RULE],
    addRules: [
      {
        id: BLOCK_RULE,
        priority: 1,
        action: { type: "block" },
        condition: {
          requestDomains: ENTERTAINMENT,
          resourceTypes: ["main_frame"],
        },
      },
    ],
  });
  await chrome.alarms.create("unfocus", { when: Date.parse(until) });
}

async function unfocus() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCK_RULE],
  });
  await chrome.alarms.clear("unfocus");
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "unfocus") unfocus();
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  // The app asks whether the extension is here before offering what it unlocks.
  if (message?.type === "ping") {
    reply({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  if (message?.type === "activity") {
    readActivity().then(reply);
    return true;
  }
  if (
    message?.type === "focus" &&
    typeof message.until === "string" &&
    Date.parse(message.until) > Date.now()
  ) {
    focusUntil(message.until).then(() => reply({ ok: true }));
    return true;
  }
  if (message?.type === "unfocus") {
    unfocus().then(() => reply({ ok: true }));
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(async () => {
  const activity = await readActivity();
  await chrome.downloads.download({
    url: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(activity))}`,
    filename: "activity.json",
    conflictAction: "overwrite",
  });
});
