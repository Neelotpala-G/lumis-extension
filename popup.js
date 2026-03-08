// popup.js — Extension popup controller

const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn  = document.getElementById('saveKeyBtn');
const apiStatus   = document.getElementById('apiStatus');
const activateBtn = document.getElementById('activateBtn');
const warnBox     = document.getElementById('warnBox');
const warnCount   = document.getElementById('warnCount');
const infoTitle   = document.getElementById('infoTitle');
const infoBody    = document.getElementById('infoBody');

chrome.storage.local.get(['apiKey'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
    showStatus('✦ Personal key active — 25,000/month', 'ok');
    infoTitle.textContent = '✦ Personal key active';
    infoBody.textContent  = '25,000 requests per month on your own key.';
  }
  loadStats();
});

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (stats) => {
    if (!stats) return;
    document.getElementById('statUsed').textContent      = stats.usedCount;
    document.getElementById('statRemaining').textContent = stats.remaining;
    document.getElementById('statDays').textContent      = stats.daysUntilReset;

    const remainEl = document.getElementById('statRemaining');
    remainEl.className = 'sn';
    if (!stats.hasPersonalKey) {
      if (stats.remaining <= 10)      remainEl.classList.add('danger');
      else if (stats.remaining <= 30) remainEl.classList.add('warn');
      else                            remainEl.classList.add('ok');
    } else {
      remainEl.classList.add('ok');
    }

    if (!stats.hasPersonalKey && stats.usedCount >= 70) {
      warnBox.classList.add('show');
      warnCount.textContent = stats.usedCount;
    }
  });
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    chrome.storage.local.remove('apiKey', () => {
      chrome.runtime.sendMessage({ action: 'resetStats' });
      showStatus('✦ Reverted to built-in key', 'ok');
      infoTitle.textContent = '✦ Ready to use — no setup required';
      warnBox.classList.remove('show');
      setTimeout(loadStats, 200);
    });
    return;
  }
  chrome.storage.local.set({ apiKey: key }, () => {
    chrome.runtime.sendMessage({ action: 'resetStats' });
    showStatus('✦ Key saved — counter reset to 0', 'ok');
    infoTitle.textContent = '✦ Personal key active';
    infoBody.textContent  = '25,000 requests per month on your own key.';
    warnBox.classList.remove('show');
    setTimeout(loadStats, 200);
  });
});

apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveKeyBtn.click(); });

activateBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
      showStatus('Cannot run on Chrome system pages.', 'err');
      return;
    }
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, { action: 'startSelection' }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
          .then(() => chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] }))
          .then(() => setTimeout(() => chrome.tabs.sendMessage(tabId, { action: 'startSelection' }), 150))
          .catch(() => showStatus('Cannot activate on this page.', 'err'));
      }
    });
    window.close();
  });
});

document.getElementById('geminiBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openSidePanel', ai: 'gemini' });
  window.close();
});

document.getElementById('claudeBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openSidePanel', ai: 'claude' });
  window.close();
});

document.getElementById('chatgptBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openSidePanel', ai: 'chatgpt' });
  window.close();
});

function showStatus(msg, type) {
  apiStatus.textContent = msg;
  apiStatus.className = 'status ' + type;
}
