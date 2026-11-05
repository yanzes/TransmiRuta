// Shared behaviour for the popup and the side panel: both embed the live map
// from the address saved in Ajustes, and both can push it into its own window.

const DEFAULT_BASE = "http://localhost:3000";
const LOAD_TIMEOUT_MS = 5000;

const $ = (id) => document.getElementById(id);

/** Accept only http(s) and drop a trailing slash, so the stored value is a clean origin+path. */
function normalizeBase(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function getBase() {
  const { baseUrl } = await chrome.storage.sync.get({ baseUrl: DEFAULT_BASE });
  return normalizeBase(baseUrl) ?? DEFAULT_BASE;
}

function boot() {
  const frame = $("app");
  const fallback = $("fallback");
  const host = $("host");
  let timer;

  // Resolved at boot: sidePanel.open() only works while the click gesture is
  // still current, so the window id cannot be awaited inside the handler.
  let windowId;
  chrome.windows.getCurrent().then((win) => {
    windowId = win.id;
  });

  // A cold `next dev` compile can take several seconds, so this is a "still
  // loading" notice, not an error: the load event hides it whenever it lands.
  const load = async () => {
    const base = await getBase();
    const shown = base.replace(/^https?:\/\//, "");
    host.textContent = shown;
    host.title = base;
    $("fallbackUrl").textContent = shown;
    fallback.hidden = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fallback.hidden = false;
    }, LOAD_TIMEOUT_MS);
    frame.src = base;
  };

  frame.addEventListener("load", () => {
    if (frame.src === "about:blank") return;
    clearTimeout(timer);
    fallback.hidden = true;
  });
  window.addEventListener("pagehide", () => clearTimeout(timer));

  $("reload")?.addEventListener("click", load);
  $("retry")?.addEventListener("click", load);
  $("opts")?.addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("side")?.addEventListener("click", () => {
    const open = windowId === undefined ? Promise.reject() : chrome.sidePanel.open({ windowId });
    open.then(
      () => window.close(),
      async () => {
        chrome.tabs.create({ url: await getBase() });
        window.close();
      },
    );
  });

  $("window")?.addEventListener("click", async () => {
    await chrome.windows.create({
      url: await getBase(),
      type: "popup",
      width: 560,
      height: 780,
    });
    window.close();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.baseUrl) void load();
  });

  void load();
}

document.addEventListener("DOMContentLoaded", boot);
