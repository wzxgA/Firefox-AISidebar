function applyTheme(theme) {
  document.body.className = `theme-${theme}`;
}

function saveOptions(e) {
  e.preventDefault();

  const apiUrl = document.getElementById('api-url').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const modelName = document.getElementById('model-name').value.trim();
  const theme = document.getElementById('theme-select').value;

  browser.storage.local.set({
    apiUrl,
    apiKey,
    modelName,
    theme
  }).then(() => {
    const status = document.getElementById('status');
    status.textContent = 'Settings saved!';
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 2000);
  });
}

function restoreOptions() {
  browser.storage.local.get({
    apiUrl: 'https://api.openai.com',
    apiKey: '',
    modelName: 'gpt-4o',
    theme: 'light'
  }).then((items) => {
    document.getElementById('api-url').value = items.apiUrl;
    document.getElementById('api-key').value = items.apiKey;
    document.getElementById('model-name').value = items.modelName;
    document.getElementById('theme-select').value = items.theme;
    applyTheme(items.theme);
  });
}

function toggleKeyVisibility() {
  const keyInput = document.getElementById('api-key');
  keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
}

// Immediate theme switch (don't wait for Save)
document.getElementById('theme-select').addEventListener('change', function () {
  applyTheme(this.value);
});

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('settings-form').addEventListener('submit', saveOptions);
document.getElementById('toggle-key').addEventListener('click', toggleKeyVisibility);
