const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat');
const typingIndicator = document.getElementById('typing-indicator') || createTypingIndicator();
const summarizeBtn = document.getElementById('summarize-btn');
const summaryContent = document.getElementById('summary-content');
const summaryPageTitle = document.getElementById('summary-page-title');

let conversationHistory = [];
let currentAssistantMsg = null;
let abortController = null;
let summaryAbortController = null;
let currentPageUrl = '';
let savedSummary = null;

// ---- Tab Switching ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    switchTab(tab);
  });
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`${tab}-view`).classList.add('active');
  if (tab === 'summary') {
    updatePageInfo();
    loadHistory();
  }
}

// Update page info when tab switches to summary or when receiving messages
async function updatePageInfo() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentPageUrl = tab.url;
      summaryPageTitle.textContent = tab.title || 'No page';
    }
  } catch {
    summaryPageTitle.textContent = 'No page';
  }
}

// ---- Settings Panel ----
const settingsPanel = document.getElementById('settings-panel');
const settingsForm = document.getElementById('settings-form');
const apiUrlInput = document.getElementById('api-url');
const apiKeyInput = document.getElementById('api-key');
const modelNameInput = document.getElementById('model-name');
const themeSelect = document.getElementById('theme-select');
const systemPromptInput = document.getElementById('system-prompt');
const summaryPromptInput = document.getElementById('summary-prompt');

document.getElementById('open-settings').addEventListener('click', () => {
  loadSettingsToForm();
  settingsPanel.classList.remove('hidden');
});

document.getElementById('close-settings').addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

document.getElementById('cancel-settings').addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

document.getElementById('toggle-key').addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});


// Theme switch (immediate — outside the Save button)
themeSelect.addEventListener('change', () => {
  const theme = themeSelect.value;
  applyTheme(theme);
  browser.storage.local.set({ theme });
});

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  browser.storage.local.set({
    apiUrl: apiUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    modelName: modelNameInput.value.trim(),
    theme: themeSelect.value,
    systemPrompt: systemPromptInput.value.trim(),
    summaryPrompt: summaryPromptInput.value.trim()
  }).then(() => {
    settingsPanel.classList.add('hidden');
  });
});

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant. When provided with context from a webpage, use it to answer the user\'s question. Format your responses with markdown for readability.';
const DEFAULT_SUMMARY_PROMPT = 'Summarize the following webpage content concisely. Highlight the main topic, key points, and important details. Use markdown formatting.';

function loadSettingsToForm() {
  browser.storage.local.get({
    apiUrl: 'https://api.openai.com',
    apiKey: '',
    modelName: 'gpt-4o',
    theme: 'light',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    summaryPrompt: DEFAULT_SUMMARY_PROMPT
  }).then((items) => {
    apiUrlInput.value = items.apiUrl;
    apiKeyInput.value = items.apiKey;
    modelNameInput.value = items.modelName;
    themeSelect.value = items.theme;
    systemPromptInput.value = items.systemPrompt;
    summaryPromptInput.value = items.summaryPrompt;
  });
}

// ---- Theme ----
function applyTheme(theme) {
  document.body.className = `theme-${theme}`;
}

function loadTheme() {
  browser.storage.local.get({ theme: 'light' }).then((items) => {
    applyTheme(items.theme);
    if (themeSelect) themeSelect.value = items.theme;
  });
}

// ---- Create typing indicator if not in HTML ----
function createTypingIndicator() {
  const el = document.createElement('div');
  el.id = 'typing-indicator';
  el.className = 'typing-indicator';
  el.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.after(el);
  return el;
}

// ---- Messages ----
clearChatBtn.addEventListener('click', () => {
  conversationHistory = [];
  // Remove all message elements, keep welcome
  messagesEl.querySelectorAll('.message').forEach(m => m.remove());
  messagesEl.querySelector('.welcome-msg')?.classList.remove('hidden');
  abortSend();
});

function addMessage(role, content, isError = false) {
  // Remove welcome message on first interaction
  const welcome = messagesEl.querySelector('.welcome-msg');
  if (welcome) welcome.classList.add('hidden');

  const div = document.createElement('div');
  div.className = `message ${role}${isError ? ' error' : ''}`;

  if (role === 'assistant') {
    const contentWrap = document.createElement('div');
    contentWrap.className = 'msg-content';
    contentWrap.innerHTML = renderMarkdown(content);
    div.appendChild(contentWrap);
  } else {
    div.textContent = content;
  }

  // Add save button for assistant (non-error) messages
  if (role === 'assistant' && !isError) {
    const saveBtn = document.createElement('button');
    saveBtn.className = 'message-save-btn';
    saveBtn.title = 'Save as .md';
    saveBtn.innerHTML = '&#x1f4be;';
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const msgContent = div.querySelector('.msg-content');
      const html = msgContent ? msgContent.innerHTML : '';
      const text = msgContent ? msgContent.textContent : '';
      const label = text.replace(/\s+/g, ' ').trim().substring(0, 50);
      saveMessage(label, html || text);
    });
    div.appendChild(saveBtn);
  }

  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---- Lightweight Markdown Renderer ----
function renderMarkdown(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code `...`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold **...**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic *...*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers ### ...
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Unordered list items
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => `<ul>${match}</ul>`);

  // Ordered list items
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs — double newlines
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Fix nested block elements inside <p>
  html = html.replace(/<p><(pre|ul|ol|h[2-4])/g, '<$1');
  html = html.replace(/<\/(pre|ul|ol|h[2-4])><\/p>/g, '</$1>');

  // Clean up empty <p> tags
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

// ---- API Call (Streaming) ----
async function sendMessage() {
  const question = userInput.value.trim();
  if (!question) return;
  if (abortController) return; // Already sending

  const settings = await browser.storage.local.get({
    apiUrl: 'https://api.openai.com',
    apiKey: '',
    modelName: 'gpt-4o',
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  });

  if (!settings.apiKey) {
    addMessage('assistant', '**Error:** API key not configured. Click the gear icon to set it up.', true);
    return;
  }

  const userContent = question;
  const displayContent = question.length > 200
    ? question.substring(0, 200) + '...'
    : question;

  addMessage('user', displayContent);
  conversationHistory.push({ role: 'user', content: userContent });

  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';

  // Show typing indicator
  typingIndicator.classList.add('active');
  sendBtn.disabled = true;

  // Build messages array with custom system prompt
  const messages = [
    { role: 'system', content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
    ...conversationHistory
  ];

  abortController = new AbortController();

  try {
    const apiBase = settings.apiUrl.replace(/\/+$/, '');
    const endpoint = apiBase.endsWith('/v1') ? `${apiBase}/chat/completions`
      : apiBase.endsWith('/v1/chat/completions') ? apiBase
      : `${apiBase}/v1/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.modelName,
        messages,
        stream: true
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `**API Error (${response.status}):** `;
      try {
        const errJson = JSON.parse(errorText);
        errorMsg += errJson.error?.message || errorText;
      } catch {
        errorMsg += errorText.substring(0, 200);
      }
      throw new Error(errorMsg);
    }

    // Create assistant message for streaming
    currentAssistantMsg = addMessage('assistant', '');
    let fullContent = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            currentAssistantMsg.querySelector('.msg-content').innerHTML = renderMarkdown(fullContent);
            scrollToBottom();
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    conversationHistory.push({ role: 'assistant', content: fullContent });
    if (!fullContent) {
      currentAssistantMsg.querySelector('.msg-content').innerHTML = '*(No response)*';
    }

  } catch (err) {
    if (err.name === 'AbortError') return;

    // Remove the empty assistant message if error occurred mid-stream
    if (currentAssistantMsg && !currentAssistantMsg.textContent) {
      currentAssistantMsg.remove();
      currentAssistantMsg = null;
    }

    addMessage('assistant', err.message || 'Network error. Check your API endpoint URL and try again.', true);
  } finally {
    typingIndicator.classList.remove('active');
    sendBtn.disabled = false;
    abortController = null;
    currentAssistantMsg = null;
  }
}

function abortSend() {
  if (abortController) {
    abortController.abort();
    abortController = null;
    typingIndicator.classList.remove('active');
    sendBtn.disabled = false;
  }
}

// ---- Save Message to .md ----
async function saveMessage(label, content) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const safeLabel = label
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50);
  const filename = `${safeLabel}-${timestamp}.md`;

  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  try {
    await browser.downloads.download({ url, filename, saveAs: true });
  } catch (err) {
    console.error('Save failed:', err);
  }

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- Summarize Page ----
async function summarizePage() {
  if (summaryAbortController) return;

  // Get page text from content script
  let pageText = '';
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');

    const response = await browser.tabs.sendMessage(tab.id, { type: 'get-page-text' });
    if (response && response.text) {
      pageText = response.text;
      currentPageUrl = response.url;
      summaryPageTitle.textContent = response.pageTitle || 'No page';
    } else {
      throw new Error('Could not extract page content');
    }
  } catch (err) {
    summaryContent.innerHTML = `<div class="summary-result" style="color:var(--msg-error-text)">**Error:** ${err.message}. Try refreshing the page.</div>`;
    return;
  }

  if (!pageText.trim()) {
    summaryContent.innerHTML = '<div class="summary-result" style="color:var(--msg-error-text)">**Error:** Page has no readable text content.</div>';
    return;
  }

  // Load settings
  const settings = await browser.storage.local.get({
    apiUrl: 'https://api.openai.com',
    apiKey: '',
    modelName: 'gpt-4o',
    summaryPrompt: DEFAULT_SUMMARY_PROMPT
  });

  if (!settings.apiKey) {
    summaryContent.innerHTML = '<div class="summary-result" style="color:var(--msg-error-text)">**Error:** API key not configured.</div>';
    return;
  }

  // Read custom instruction
  const customPrompt = document.getElementById('summary-custom-prompt').value.trim();

  // Truncate text
  const maxChars = 8000;
  const truncatedText = pageText.length > maxChars
    ? pageText.substring(0, maxChars) + '...'
    : pageText;

  // UI state
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = 'Summarizing...';
  summaryContent.innerHTML = '<div class="summary-result"><em>Generating summary...</em></div>';

  summaryAbortController = new AbortController();

  try {
    const apiBase = settings.apiUrl.replace(/\/+$/, '');
    const endpoint = apiBase.endsWith('/v1') ? `${apiBase}/chat/completions`
      : apiBase.endsWith('/v1/chat/completions') ? apiBase
      : `${apiBase}/v1/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.modelName,
        messages: [
          { role: 'system', content: settings.summaryPrompt || DEFAULT_SUMMARY_PROMPT },
          { role: 'user', content: `${customPrompt ? customPrompt + '\n\n' : ''}Webpage URL: ${currentPageUrl}\n\nContent:\n${truncatedText}` }
        ],
        stream: true
      }),
      signal: summaryAbortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `API Error (${response.status}): `;
      try {
        const errJson = JSON.parse(errorText);
        errorMsg += errJson.error?.message || errorText;
      } catch {
        errorMsg += errorText.substring(0, 200);
      }
      throw new Error(errorMsg);
    }

    // Stream summary
    summaryContent.innerHTML = '<div class="summary-result"></div>';
    const resultEl = summaryContent.querySelector('.summary-result');
    let fullContent = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            resultEl.innerHTML = renderMarkdown(fullContent);
          }
        } catch { /* skip */ }
      }
    }

    if (!fullContent) {
      resultEl.innerHTML = '*(No response)*';
    }

    savedSummary = fullContent;
    saveSummary(summaryPageTitle.textContent, currentPageUrl, fullContent);

    // Add save button row
    const saveRow = document.createElement('div');
    saveRow.className = 'summary-save-row';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-secondary btn-sm';
    saveBtn.innerHTML = '&#x1f4be; Save as .md';
    saveBtn.addEventListener('click', () => {
      saveMessage(summaryPageTitle.textContent, fullContent);
    });
    saveRow.appendChild(saveBtn);
    summaryContent.appendChild(saveRow);

  } catch (err) {
    if (err.name === 'AbortError') return;
    summaryContent.innerHTML = `<div class="summary-result" style="color:var(--msg-error-text)">**Error:** ${err.message}</div>`;
  } finally {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Summarize Page';
    summaryAbortController = null;
  }
}

summarizeBtn.addEventListener('click', summarizePage);

// ---- Summary History ----
const clearHistoryBtn = document.getElementById('clear-history');
const historyList = document.getElementById('history-list');
const MAX_HISTORY = 50;

async function saveSummary(pageTitle, url, content) {
  const { summaryHistory } = await browser.storage.local.get({ summaryHistory: [] });
  const entry = {
    id: Date.now(),
    pageTitle,
    url,
    content,
    date: new Date().toISOString()
  };
  summaryHistory.unshift(entry);
  if (summaryHistory.length > MAX_HISTORY) {
    summaryHistory.length = MAX_HISTORY;
  }
  await browser.storage.local.set({ summaryHistory });
  renderHistoryList(summaryHistory);
}

async function loadHistory() {
  const { summaryHistory } = await browser.storage.local.get({ summaryHistory: [] });
  renderHistoryList(summaryHistory);
}

function renderHistoryList(list) {
  if (!historyList) return;
  if (list.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No summaries yet</div>';
    return;
  }
  historyList.innerHTML = list.map(item => {
    const date = new Date(item.date).toLocaleDateString();
    return `
      <div class="history-item" data-id="${item.id}">
        <div class="history-item-info">
          <div class="history-item-title">${escapeHtml(item.pageTitle)}</div>
          <div class="history-item-date">${date}</div>
        </div>
        <button class="history-item-del" data-id="${item.id}" title="Delete">&#x2715;</button>
      </div>
    `;
  }).join('');

  // Click on history item (info area) → show summary
  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.history-item-del')) return;
      const id = Number(el.dataset.id);
      showHistorySummary(id);
    });
  });

  // Delete button
  historyList.querySelectorAll('.history-item-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      await deleteHistoryItem(id);
    });
  });
}

async function showHistorySummary(id) {
  const { summaryHistory } = await browser.storage.local.get({ summaryHistory: [] });
  const item = summaryHistory.find(s => s.id === id);
  if (!item) return;

  summaryContent.innerHTML = `<div class="summary-result">${renderMarkdown(item.content)}</div>`;

  // Add save button for history items too
  const saveRow = document.createElement('div');
  saveRow.className = 'summary-save-row';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-secondary btn-sm';
  saveBtn.innerHTML = '&#x1f4be; Save as .md';
  saveBtn.addEventListener('click', () => {
    saveMessage(item.pageTitle, item.content);
  });
  saveRow.appendChild(saveBtn);
  summaryContent.appendChild(saveRow);

  // Highlight active
  historyList.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
  const activeEl = historyList.querySelector(`[data-id="${id}"]`);
  if (activeEl) activeEl.classList.add('active');
}

async function deleteHistoryItem(id) {
  const { summaryHistory } = await browser.storage.local.get({ summaryHistory: [] });
  const updated = summaryHistory.filter(s => s.id !== id);
  await browser.storage.local.set({ summaryHistory: updated });
  renderHistoryList(updated);

  // If deleted item was being viewed, clear
  const activeEl = historyList.querySelector(`[data-id="${id}"]`);
  if (activeEl && activeEl.classList.contains('active')) {
    summaryContent.innerHTML = '<div class="summary-placeholder">Click <strong>"Summarize Page"</strong> to generate a summary of the current page.</div>';
  }
}

async function clearAllHistory() {
  await browser.storage.local.set({ summaryHistory: [] });
  renderHistoryList([]);
  summaryContent.innerHTML = '<div class="summary-placeholder">Click <strong>"Summarize Page"</strong> to generate a summary of the current page.</div>';
}

clearHistoryBtn.addEventListener('click', clearAllHistory);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Event Listeners ----
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  if (e.key === 'Escape') {
    abortSend();
  }
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

// ---- Receive messages from content script / background ----
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'selected-text') {
    userInput.value = message.text;
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    userInput.focus();
  }
});

// ---- Initial setup ----
loadTheme();
loadSettingsToForm();
updatePageInfo();
