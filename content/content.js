let tooltip = null;

function getSelectionInfo() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  if (!text) return null;

  return {
    text,
    pageTitle: document.title,
    url: window.location.href
  };
}

function removeTooltip() {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}

function createTooltip(rect) {
  removeTooltip();

  tooltip = document.createElement('div');
  tooltip.id = 'llm-sidebar-tooltip';
  tooltip.textContent = 'Ask LLM';
  tooltip.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: #6C3CE1;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: opacity 0.15s;
    pointer-events: auto;
  `;

  tooltip.style.left = Math.min(rect.right + 8, window.innerWidth - 100) + 'px';
  tooltip.style.top = Math.max(rect.bottom + 4, 8) + 'px';

  tooltip.addEventListener('click', (e) => {
    e.stopPropagation();
    const info = getSelectionInfo();
    if (info) {
      browser.runtime.sendMessage({ type: 'selected-text', ...info });
    }
    removeTooltip();
  });

  document.body.appendChild(tooltip);
}

document.addEventListener('mouseup', (e) => {
  // Small delay to let the selection settle
  setTimeout(() => {
    const info = getSelectionInfo();
    if (!info) {
      removeTooltip();
      return;
    }

    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      removeTooltip();
      return;
    }

    createTooltip(rect);
  }, 10);
});

// Hide tooltip when clicking elsewhere
document.addEventListener('mousedown', (e) => {
  if (tooltip && e.target !== tooltip && !tooltip.contains(e.target)) {
    removeTooltip();
  }
});

// Listen for re-request of current selection from sidebar
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'get-selection') {
    return Promise.resolve(getSelectionInfo());
  }
});
