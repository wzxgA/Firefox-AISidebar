const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const contextBar = document.getElementById('context-bar');
const contextText = document.getElementById('context-text');
const clearContextBtn = document.getElementById('clear-context');
const clearChatBtn = document.getElementById('clear-chat');
const typingIndicator = document.getElementById('typing-indicator') || createTypingIndicator();

let selectedContext = null;
let conversationHistory = [];
let currentAssistantMsg = null;
let abortController = null;

// ---- Settings Panel ----
const settingsPanel = document.getElementById('settings-panel');
const settingsForm = document.getElementById('settings-form');
const apiUrlInput = document.getElementById('api-url');
const apiKeyInput = document.getElementById('api-key');
const modelNameInput = document.getElementById('model-name');

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

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  browser.storage.local.set({
    apiUrl: apiUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    modelName: modelNameInput.value.trim()
  }).then(() => {
    settingsPanel.classList.add('hidden');
  });
});

function loadSettingsToForm() {
  browser.storage.local.get({
    apiUrl: 'https://api.openai.com',
    apiKey: '',
    modelName: 'gpt-4o'
  }).then((items) => {
    apiUrlInput.value = items.apiUrl;
    apiKeyInput.value = items.apiKey;
    modelNameInput.value = items.modelName;
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

// ---- Context Management ----
clearContextBtn.addEventListener('click', () => {
  clearContext();
});

function setContext(info) {
  selectedContext = info;
  contextText.textContent = info.text.length > 300
    ? info.text.substring(0, 300) + '...'
    : info.text;
  contextBar.classList.remove('hidden');
}

function clearContext() {
  selectedContext = null;
  contextText.textContent = '';
  contextBar.classList.add('hidden');
}

// ---- Messages ----
clearChatBtn.addEventListener('click', () => {
  conversationHistory = [];
  clearContext();
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
  if (!question && !selectedContext) return;
  if (abortController) return; // Already sending

  const settings = await browser.storage.local.get({
    apiUrl: 'https://api.openai.com',
    apiKey: '',
    modelName: 'gpt-4o'
  });

  if (!settings.apiKey) {
    addMessage('assistant', '**Error:** API key not configured. Click the gear icon to set it up.', true);
    return;
  }

  // Build user message
  let userContent = '';
  if (selectedContext) {
    userContent += `Context from "${selectedContext.pageTitle}" (${selectedContext.url}):\n---\n${selectedContext.text}\n---\n\n`;
  }
  userContent += question || 'Please summarize the selected text.';

  const userMsg = addMessage('user', question || 'Summarize selected text');
  conversationHistory.push({ role: 'user', content: userContent });

  // Clear input and context
  userInput.value = '';
  clearContext();
  userInput.style.height = 'auto';

  // Show typing indicator
  typingIndicator.classList.add('active');
  sendBtn.disabled = true;

  // Build messages array
  const messages = [
    { role: 'system', content: 'You are a helpful assistant. When provided with context from a webpage, use it to answer the user\'s question. Format your responses with markdown for readability.' },
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
    setContext({
      text: message.text,
      pageTitle: message.pageTitle,
      url: message.url
    });
    // Focus the input so user can type a question
    userInput.focus();
  }
});

// ---- Initial setup ----
loadSettingsToForm();
