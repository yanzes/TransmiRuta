// Right-clicking the toolbar icon opens the map in the side panel, so it can
// stay pinned next to whatever else the user is doing.

const SIDE_MENU_ID = "transmi-side-panel";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SIDE_MENU_ID,
      title: "Abrir TransMilenio en el panel lateral",
      contexts: ["action"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== SIDE_MENU_ID) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch {
    // Older builds or a window that no longer exists: open the app in a tab.
    const { baseUrl } = await chrome.storage.sync.get({ baseUrl: "http://localhost:3000" });
    chrome.tabs.create({ url: baseUrl });
  }
});
