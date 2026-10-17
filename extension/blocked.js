// The way through Lockdown. A visit lands here first:
//   ?check=<address>  a site not judged yet: ask about it, then let the tab go
//                     on (study, unsure, or couldn't ask) or send it to focus;
//   ?url=<address>    a known distraction, sent here before it loaded.
// A distraction goes to the app's own focus page for the session (toFocus in
// background.js); this page shows nothing but the site's name while it asks.

const send = (message) => chrome.runtime.sendMessage(message);

const search = location.search;
const checking = search.startsWith("?check=");
const target = checking
  ? decodeURIComponent(search.slice("?check=".length))
  : search.startsWith("?url=")
    ? search.slice("?url=".length)
    : "";

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

let leaving = false;
function goOn() {
  if (leaving) return;
  leaving = true;
  if (target) location.replace(target);
}

async function main() {
  const host = hostOf(target);
  document.querySelector("#host").textContent = host ?? "";
  const lockdown = await send({ type: "lockdown" });
  if (!lockdown || !host) return goOn();
  if (checking) {
    document.body.dataset.state = "checking";
    const verdict = await send({ type: "judge", url: target });
    if (verdict !== "distraction") return goOn();
  }
  leaving = true;
  const answer = await send({ type: "to-focus" });
  if (answer?.back) return history.back();
  if (!answer?.sent) {
    leaving = false;
    goOn();
  }
}

// Lockdown lifted while asking: the tab goes on.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lockdown && !changes.lockdown.newValue)
    goOn();
});

void main();
