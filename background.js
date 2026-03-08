// background.js — Service worker: screenshots, OCR, stats, side panel

const DEFAULT_KEY    = 'helloworld';
const DEFAULT_LIMIT  = 100;
const PERSONAL_LIMIT = 25000;

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getDaysUntilReset() {
  const now = new Date();
  const firstNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((firstNext - now) / (1000 * 60 * 60 * 24));
}

async function getStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'usedCount', 'monthKey'], (r) => {
      const currentMonth = getCurrentMonth();
      let usedCount = r.usedCount || 0;
      const monthKey = r.monthKey || currentMonth;
      const hasPersonalKey = !!r.apiKey;
      const limit = hasPersonalKey ? PERSONAL_LIMIT : DEFAULT_LIMIT;
      if (monthKey !== currentMonth) {
        usedCount = 0;
        chrome.storage.local.set({ usedCount: 0, monthKey: currentMonth });
      }
      resolve({ usedCount, limit, remaining: Math.max(0, limit - usedCount), daysUntilReset: getDaysUntilReset(), hasPersonalKey });
    });
  });
}

// ── Set side panel to open on action click ──
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Screenshot
  if (message.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
      else sendResponse({ dataUrl });
    });
    return true;
  }

  // Stats
  if (message.action === 'getStats') {
    getStats().then(stats => sendResponse(stats));
    return true;
  }

  // Reset stats
  if (message.action === 'resetStats') {
    chrome.storage.local.set({ usedCount: 0, monthKey: getCurrentMonth() }, () => sendResponse({ ok: true }));
    return true;
  }

  // OCR
  if (message.action === 'runOCR') {
    chrome.storage.local.get(['apiKey', 'usedCount', 'monthKey'], async (r) => {
      const currentMonth = getCurrentMonth();
      let usedCount = r.usedCount || 0;
      const monthKey = r.monthKey || currentMonth;
      const apiKey = r.apiKey || DEFAULT_KEY;
      const isDefaultKey = !r.apiKey;
      const limit = isDefaultKey ? DEFAULT_LIMIT : PERSONAL_LIMIT;

      if (monthKey !== currentMonth) {
        usedCount = 0;
        chrome.storage.local.set({ usedCount: 0, monthKey: currentMonth });
      }

      if (isDefaultKey && usedCount >= DEFAULT_LIMIT) {
        sendResponse({ success: false, error: 'LIMIT_REACHED' });
        return;
      }

      try {
        const formData = new FormData();
        formData.append('base64Image', message.imageDataUrl);
        formData.append('apikey', apiKey);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2');

        const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
        if (!response.ok) { sendResponse({ success: false, error: `Server error ${response.status}` }); return; }

        const data = await response.json();
        if (data.IsErroredOnProcessing) { sendResponse({ success: false, error: data.ErrorMessage?.[0] || 'OCR failed' }); return; }

        const text = data.ParsedResults?.map(r => r.ParsedText).join('\n').trim() || '';
        const newCount = usedCount + 1;
        chrome.storage.local.set({ usedCount: newCount, monthKey: currentMonth });
        sendResponse({ success: true, text, usedCount: newCount, limit, remaining: Math.max(0, limit - newCount) });
      } catch (err) {
        sendResponse({ success: false, error: 'Network error. Check your internet connection.' });
      }
    });
    return true;
  }

  // Activate selection from popup
  if (message.action === 'activateSelection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(tabId, { action: 'startSelection' }, (res) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
            .then(() => chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] }))
            .then(() => setTimeout(() => chrome.tabs.sendMessage(tabId, { action: 'startSelection' }), 150))
            .catch(() => {});
        }
      });
    });
    sendResponse({ status: 'ok' });
    return true;
  }

  // ── Open side panel with Gemini or ChatGPT ──
  if (message.action === 'openSidePanel') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) return;
      try {
        // Open the side panel
        await chrome.sidePanel.open({ tabId: tabs[0].id });
        // Wait for panel to initialize, then tell it which AI to load
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'loadAI',
            ai: message.ai || 'gemini',
            query: message.query || ''
          }).catch(() => {
            // Panel may not be ready yet, retry once
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'loadAI',
                ai: message.ai || 'gemini',
                query: message.query || ''
              }).catch(() => {});
            }, 500);
          });
        }, 700);
      } catch (e) {
        console.error('Side panel open error:', e);
      }
    });
    sendResponse({ status: 'ok' });
    return true;
  }

});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'activate-ocr') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'startSelection' });
    });
  }
});
