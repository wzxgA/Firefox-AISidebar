// Create context menu item
browser.contextMenus.create({
  id: 'ask-llm-selection',
  title: 'Ask Sidebar LLM about selection',
  contexts: ['selection']
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ask-llm-selection' && info.selectionText) {
    const payload = {
      type: 'selected-text',
      text: info.selectionText.trim(),
      pageTitle: tab?.title || '',
      url: tab?.url || ''
    };

    // Send to sidebar
    browser.runtime.sendMessage(payload).catch(() => {
      // Sidebar may not be open — that's fine, the message is fire-and-forget
    });
  }
});

// Open sidebar on install
browser.runtime.onInstalled.addListener(() => {
  browser.sidebarAction?.open?.().catch(() => {});
});
