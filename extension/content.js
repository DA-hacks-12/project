// The bridge between the app's page and the extension: the page posts a
// request, this passes it on and posts the answer back.
window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "planner") return;
  const { source: _source, id, ...request } = event.data;
  chrome.runtime.sendMessage(request, (result) => {
    window.postMessage(
      { source: "planner-extension", id, result: result ?? null },
      window.location.origin,
    );
  });
});
