// Clicking the toolbar button reads the last DAYS of this browser's history
// and saves active hours to Downloads/activity.json for the workflow.
import { activeHours } from "./activity.js";

const DAYS = 28;

chrome.action.onClicked.addListener(async () => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (DAYS - 1));
  const startTime = since.getTime();

  const pages = await chrome.history.search({ text: "", startTime, maxResults: 100000 });
  const visits = await Promise.all(pages.map((page) => chrome.history.getVisits({ url: page.url })));
  const times = visits
    .flat()
    .filter((visit) => visit.visitTime >= startTime && visit.isLocal !== false)
    .map((visit) => visit.visitTime);

  const activity = { days: DAYS, hours: activeHours(times, DAYS), saved: new Date().toISOString() };
  await chrome.downloads.download({
    url: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(activity))}`,
    filename: "activity.json",
    conflictAction: "overwrite",
  });
});
