/** Service worker for the Voyager Test Extension. */

// Toggle the test panel when the extension icon is clicked.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' })
  } catch {
    // Content script not loaded on this page — ignore
    console.log('[voyager-test] Content script not available on this tab.')
  }
})
