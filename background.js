// Relay messages from content script to sidebar
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'selected-text' && sender.tab) {
    // Forward to sidebar — fire-and-forget, sidebar may not be open
    browser.runtime.sendMessage(message).catch(() => {});
  }
});

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

    browser.runtime.sendMessage(payload).catch(() => {});
  }
});

// Open sidebar on install
browser.runtime.onInstalled.addListener(() => {
  browser.sidebarAction?.open?.().catch(() => {});
});
