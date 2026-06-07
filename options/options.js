function saveOptions(e) {
  e.preventDefault();

  const apiUrl = document.getElementById('api-url').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const modelName = document.getElementById('model-name').value.trim();

  browser.storage.local.set({
    apiUrl,
    apiKey,
    modelName
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
    modelName: 'gpt-4o'
  }).then((items) => {
    document.getElementById('api-url').value = items.apiUrl;
    document.getElementById('api-key').value = items.apiKey;
    document.getElementById('model-name').value = items.modelName;
  });
}

function toggleKeyVisibility() {
  const keyInput = document.getElementById('api-key');
  keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('settings-form').addEventListener('submit', saveOptions);
document.getElementById('toggle-key').addEventListener('click', toggleKeyVisibility);
