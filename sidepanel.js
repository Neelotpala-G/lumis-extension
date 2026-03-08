// sidepanel.js — Lumis AI panel controller

const frame        = document.getElementById('ai-frame');
const loadScreen   = document.getElementById('loading-screen');
const claudeScreen = document.getElementById('claude-screen');
const loadTitle    = document.getElementById('loadTitle');
const tabGemini    = document.getElementById('tabGemini');
const tabClaude    = document.getElementById('tabClaude');
const tabChatGPT   = document.getElementById('tabChatGPT');
const refreshBtn   = document.getElementById('refreshBtn');
const claudeOpenBtn= document.getElementById('claudeOpenBtn');
const queryPreview = document.getElementById('queryPreview');
const queryText    = document.getElementById('queryText');

let currentAI = 'gemini';

const AI_URLS = {
  gemini : 'https://gemini.google.com/app',
  chatgpt: 'https://chatgpt.com'
};

const AI_NAMES = {
  gemini : 'Gemini',
  claude : 'Claude',
  chatgpt: 'ChatGPT'
};

const TABS = { gemini: tabGemini, claude: tabClaude, chatgpt: tabChatGPT };

function hideAll() {
  frame.classList.remove('visible');
  loadScreen.classList.add('hidden');
  claudeScreen.classList.remove('visible');
}

function loadAI(ai, query) {
  currentAI = ai;

  // Update tab styles
  Object.entries(TABS).forEach(([key, tab]) => {
    tab.classList.toggle('active', key === ai);
  });

  // Claude can't load in iframe — show branded fallback screen
  if (ai === 'claude') {
    hideAll();
    claudeScreen.classList.add('visible');

    // Build Claude URL with query pre-filled if available
    let url = 'https://claude.ai/new';
    if (query && query.trim()) {
      url += '?q=' + encodeURIComponent(query.trim());
      // Show the query preview so user knows what will be sent
      queryText.textContent = query.trim().length > 120
        ? query.trim().slice(0, 120) + '…'
        : query.trim();
      queryPreview.classList.add('show');
    } else {
      queryPreview.classList.remove('show');
    }
    claudeOpenBtn.href = url;
    return;
  }

  // For Gemini / ChatGPT — load in iframe
  hideAll();
  loadScreen.classList.remove('hidden');
  loadTitle.textContent = `Loading ${AI_NAMES[ai]}...`;

  let url = AI_URLS[ai];
  if (query && query.trim()) {
    if (ai === 'chatgpt') url += '?q=' + encodeURIComponent(query.trim());
  }
  frame.src = url;
}

// When iframe loads — show it
frame.addEventListener('load', () => {
  setTimeout(() => {
    loadScreen.classList.add('hidden');
    frame.classList.add('visible');
  }, 400);
});

// Tabs
tabGemini.addEventListener('click',  () => loadAI('gemini'));
tabClaude.addEventListener('click',  () => loadAI('claude'));
tabChatGPT.addEventListener('click', () => loadAI('chatgpt'));

// Refresh — not applicable for Claude screen
refreshBtn.addEventListener('click', () => {
  if (currentAI === 'claude') {
    // Just re-open the link
    claudeOpenBtn.click();
    return;
  }
  frame.classList.remove('visible');
  loadScreen.classList.remove('hidden');
  loadTitle.textContent = `Reloading ${AI_NAMES[currentAI]}...`;
  frame.src = frame.src;
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'loadAI') {
    loadAI(message.ai || 'gemini', message.query || '');
  }
});

// Initial load
loadAI('gemini');
