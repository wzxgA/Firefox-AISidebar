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
    div.innerHTML = renderMarkdown(content);
  } else {
    div.textContent = content;
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
            currentAssistantMsg.innerHTML = renderMarkdown(fullContent);
            scrollToBottom();
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    conversationHistory.push({ role: 'assistant', content: fullContent });
    if (!fullContent) {
      currentAssistantMsg.innerHTML = '*(No response)*';
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
          { role: 'user', content: `Webpage URL: ${currentPageUrl}\n\nContent:\n${truncatedText}` }
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
