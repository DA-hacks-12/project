// The toolbar popup: the connection with the app, Lockdown, the hours learned
// from this browser, and a way back to the app.

const send = (message) => chrome.runtime.sendMessage(message);
const $ = (selector) => document.querySelector(selector);

const STATES = {
  connected: "Connected",
  "signed-out": "Signed out",
  unreachable: "Can't reach Planner",
};

/** "3:15pm", as the app writes times. */
function clock(date) {
  const hour = date.getHours() % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}${date.getHours() < 12 ? "am" : "pm"}`;
}

async function main() {
  const [status, lockdown, activity] = await Promise.all([
    send({ type: "status" }),
    send({ type: "sync" }),
    send({ type: "activity" }),
  ]);

  const state = status?.state ?? "unreachable";
  $("#status").dataset.state = state;
  $("#state").textContent = STATES[state];
  $("#email").textContent = state === "connected" ? (status.email ?? "") : "";
  $("#email").hidden = state !== "connected";

  // Off in Options; on with nothing under way; or blocking now.
  $("#lockdown").textContent = !lockdown?.on
    ? "Off"
    : lockdown.lockdown
      ? `Blocking until ${clock(new Date(lockdown.lockdown.until))}`
      : "On";

  const bars = $("#bars");
  for (const share of activity?.hours ?? []) {
    const bar = document.createElement("i");
    bar.style.height = `${Math.max(2, share)}%`;
    bars.append(bar);
  }
}

$("#open").addEventListener("click", async () => {
  await send({ type: "open" });
  window.close();
});

void main();
