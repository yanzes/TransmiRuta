const DEFAULT_BASE = "http://localhost:3000";

const $ = (id) => document.getElementById(id);
const input = $("base");
const status = $("status");

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

function say(message, tone) {
  status.textContent = message;
  status.className = tone ? `status ${tone}` : "status";
}

async function load() {
  const { baseUrl } = await chrome.storage.sync.get({ baseUrl: DEFAULT_BASE });
  input.value = normalizeBase(baseUrl) ?? DEFAULT_BASE;
  input.placeholder = DEFAULT_BASE;
}

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const base = normalizeBase(input.value);
  if (!base) {
    input.setAttribute("aria-invalid", "true");
    say("Escribe una dirección http:// o https:// válida.", "bad");
    return;
  }
  input.removeAttribute("aria-invalid");
  input.value = base;
  await chrome.storage.sync.set({ baseUrl: base });
  say(`Guardado: ${base}`, "ok");
});

input.addEventListener("input", () => {
  input.removeAttribute("aria-invalid");
  say("");
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.sync.set({ baseUrl: DEFAULT_BASE });
  await load();
  say("Restaurado a local.", "ok");
});

$("open").addEventListener("click", async () => {
  const { baseUrl } = await chrome.storage.sync.get({ baseUrl: DEFAULT_BASE });
  chrome.tabs.create({ url: normalizeBase(baseUrl) ?? DEFAULT_BASE });
});

void load();
