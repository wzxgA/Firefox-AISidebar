let tooltip = null;
let pendingSelection = null;

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
  pendingSelection = null;
}

async function createTooltip(rect, selectionInfo) {
  removeTooltip();

  pendingSelection = selectionInfo;

  // Read theme to style tooltip accordingly
  const { theme } = await browser.storage.local.get({ theme: 'light' });

  let tooltipStyle;
  if (theme === 'pixel') {
    tooltipStyle = `
      background: #C4983A;
      color: #1E140E;
      padding: 8px 14px;
      border: 2px solid #6B2F1C;
      font-size: 11px;
      font-family: 'Press Start 2P', 'Courier New', monospace;
      box-shadow: 4px 4px 0 #0F0A06;
      text-transform: uppercase;
    `;
  } else if (theme === 'dark') {
    tooltipStyle = `
      background: #6C3CE1;
      color: #ffffff;
      padding: 6px 14px;
      border: none;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
  } else {
    tooltipStyle = `
      background: #6C3CE1;
      color: #ffffff;
      padding: 6px 14px;
      border: none;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
  }

  tooltip = document.createElement('div');
  tooltip.id = 'llm-sidebar-tooltip';
  tooltip.textContent = 'Ask LLM';
  tooltip.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    cursor: pointer;
    pointer-events: auto;
    border-radius: ${theme === 'pixel' ? '0' : '6px'};
    ${tooltipStyle}
  `;

  tooltip.style.left = Math.min(rect.right + 8, window.innerWidth - 100) + 'px';
  tooltip.style.top = Math.max(rect.bottom + 4, 8) + 'px';

  tooltip.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (pendingSelection) {
      browser.runtime.sendMessage({ type: 'selected-text', ...pendingSelection });
    }
    removeTooltip();
  });

  document.body.appendChild(tooltip);
}

document.addEventListener('mouseup', (e) => {
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

    createTooltip(rect, info);
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
