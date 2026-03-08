// ============================================================
// content.js — All in-page UI: selection overlay, result popup,
// dragging, URL detection, selection menu, notifications
// ============================================================

(function () {
  if (window.__ocrGrabberListening) return;
  window.__ocrGrabberListening = true;

  let isSelecting = false;
  let startX, startY;
  let dimOverlay, selectionBox, infoLabel;
  let lastCroppedImage = null; // saved for download

  // ── Selection Mode ────────────────────────────────────────

  function startSelectionMode() {
    if (isSelecting) return;
    isSelecting = true;

    dimOverlay = document.createElement('div');
    dimOverlay.id = 'ocr-dim-overlay';
    document.body.appendChild(dimOverlay);

    selectionBox = document.createElement('div');
    selectionBox.id = 'ocr-selection-box';
    document.body.appendChild(selectionBox);

    infoLabel = document.createElement('div');
    infoLabel.id = 'ocr-info-label';
    infoLabel.textContent = 'Drag to select area  •  ESC to cancel';
    document.body.appendChild(infoLabel);

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.body.style.cursor = 'crosshair';
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    startX = e.clientX; startY = e.clientY;
    selectionBox.style.display = 'block';
    selectionBox.style.left   = startX + 'px';
    selectionBox.style.top    = startY + 'px';
    selectionBox.style.width  = '0px';
    selectionBox.style.height = '0px';
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
  }

  function onMouseMove(e) {
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    selectionBox.style.left   = x + 'px';
    selectionBox.style.top    = y + 'px';
    selectionBox.style.width  = w + 'px';
    selectionBox.style.height = h + 'px';
    infoLabel.textContent = `Selected: ${w} × ${h} px`;
  }

  function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    cleanup();
    if (w < 10 || h < 10) {
      showNotification('Selection too small. Please drag a larger area.', 'error');
      return;
    }
    captureAndOCR(x, y, w, h);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
      showNotification('Selection cancelled.', 'info');
    }
  }

  function cleanup() {
    isSelecting = false;
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.body.style.cursor = '';
    [dimOverlay, selectionBox, infoLabel].forEach(el => el && el.remove());
    dimOverlay = selectionBox = infoLabel = null;
  }

  // ── Capture & OCR ─────────────────────────────────────────

  function captureAndOCR(x, y, w, h) {
    showNotification('📸 Capturing...', 'info');
    chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
      if (!response || response.error) {
        showNotification('❌ Capture failed: ' + (response?.error || 'unknown'), 'error');
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        canvas.getContext('2d').drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, w * dpr, h * dpr);
        const cropped = canvas.toDataURL('image/png');
        lastCroppedImage = cropped; // save for download later
        sendToOCR(cropped);
      };
      img.onerror = () => showNotification('❌ Failed to process screenshot.', 'error');
      img.src = response.dataUrl;
    });
  }

  function sendToOCR(imageDataUrl) {
    showNotification('__loading__', 'loading'); // shows spinner

    chrome.runtime.sendMessage({ action: 'runOCR', imageDataUrl }, (response) => {
      // Remove the loading spinner
      const existing = document.getElementById('ocr-notification');
      if (existing) existing.remove();

      if (chrome.runtime.lastError) {
        showNotification('❌ ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (!response?.success) {
        if (response?.error === 'LIMIT_REACHED') {
          showNotification('⚠️ 100 free uses reached! Get your own free key at ocr.space/ocrapi/freekey', 'error');
        } else {
          showNotification('❌ ' + (response?.error || 'OCR failed. Please try again.'), 'error');
        }
        return;
      }

      const text = response.text;
      if (!text || !text.trim()) {
        showNotification('No text found in the selected area.', 'error');
        return;
      }

      // Auto-copy to clipboard immediately
      navigator.clipboard.writeText(text).then(() => {
        showNotification('✅ Text detected & copied to clipboard!', 'success');
      }).catch(() => {
        showNotification('✅ Text detected!', 'success');
      });

      // Show result popup after brief delay so notification is visible first
      setTimeout(() => showResultPopup(text), 600);
    });
  }

  // ── Result Popup ──────────────────────────────────────────

  function showResultPopup(text) {
    // Remove existing popup and selection menu
    ['ocr-result-popup', 'ocr-sel-menu'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    const popup = document.createElement('div');
    popup.id = 'ocr-result-popup';

    // Linkify URLs for the display view
    const displayHtml = linkifyText(escHtml(text));

    popup.innerHTML = `
      <div id="ocr-popup-header">
        <span>📋 Detected Text</span>
        <button id="ocr-close-btn" title="Close">✕</button>
      </div>
      <div id="ocr-text-display">${displayHtml}</div>
      <textarea id="ocr-text-area" class="ocr-hidden">${escHtml(text)}</textarea>
      <div id="ocr-popup-actions">
        <button id="ocr-copy-btn">📋 Copy</button>
        <button id="ocr-edit-btn">✏️ Edit</button>
        <button id="ocr-google-btn">🔍 Google It</button>
        <button id="ocr-download-btn">⬇️ Download</button>
      </div>
    `;
    document.body.appendChild(popup);

    // Make the popup draggable by its header
    makeDraggable(popup);

    // ── Close button
    popup.querySelector('#ocr-close-btn').onclick = () => {
      popup.remove();
      const sm = document.getElementById('ocr-sel-menu');
      if (sm) sm.remove();
    };

    // ── Copy button — copies current text (edited or original)
    popup.querySelector('#ocr-copy-btn').onclick = () => {
      const currentText = getCurrentText();
      navigator.clipboard.writeText(currentText).then(() => {
        showNotification('✅ Copied!', 'success');
      }).catch(() => {
        const ta = popup.querySelector('#ocr-text-area');
        ta.select();
        document.execCommand('copy');
        showNotification('✅ Copied!', 'success');
      });
    };

    // ── Edit/Lock button — toggles between read view and edit textarea
    popup.querySelector('#ocr-edit-btn').onclick = () => {
      const display = popup.querySelector('#ocr-text-display');
      const ta      = popup.querySelector('#ocr-text-area');
      const btn     = popup.querySelector('#ocr-edit-btn');

      if (ta.classList.contains('ocr-hidden')) {
        // Switch to edit mode
        display.classList.add('ocr-hidden');
        ta.classList.remove('ocr-hidden');
        ta.focus();
        btn.textContent = '🔒 Lock';
      } else {
        // Switch back to display mode, update with edited text
        display.innerHTML = linkifyText(escHtml(ta.value));
        ta.classList.add('ocr-hidden');
        display.classList.remove('ocr-hidden');
        btn.textContent = '✏️ Edit';
      }
    };

    // ── Google It button — searches selected text or full text
    popup.querySelector('#ocr-google-btn').onclick = () => {
      const query = getSelectedText() || getCurrentText();
      if (query.trim()) {
        window.open('https://www.google.com/search?q=' + encodeURIComponent(query.trim()), '_blank');
      }
    };

    // ── Download button — saves HTML report with image + text
    popup.querySelector('#ocr-download-btn').onclick = () => {
      downloadReport(getCurrentText(), lastCroppedImage);
    };

    // ── Selection menu: show "Ask Gemini" + "Google It" on text highlight
    const display = popup.querySelector('#ocr-text-display');
    display.addEventListener('mouseup', (e) => {
      // Small delay to let selection finalize
      setTimeout(() => {
        const selected = window.getSelection().toString().trim();
        if (selected.length > 0) {
          showSelectionMenu(e.clientX, e.clientY, selected);
        } else {
          hideSelectionMenu();
        }
      }, 20);
    });

    // Also handle textarea selection in edit mode
    const ta = popup.querySelector('#ocr-text-area');
    ta.addEventListener('mouseup', (e) => {
      setTimeout(() => {
        const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
        if (selected.length > 0) {
          showSelectionMenu(e.clientX, e.clientY, selected);
        } else {
          hideSelectionMenu();
        }
      }, 20);
    });

    // Helper: get current displayed text (textarea if editing, else display div text)
    function getCurrentText() {
      const ta = popup.querySelector('#ocr-text-area');
      if (!ta.classList.contains('ocr-hidden')) return ta.value;
      return popup.querySelector('#ocr-text-display').innerText;
    }
  }

  // ── Selection Floating Menu ───────────────────────────────

  function showSelectionMenu(mouseX, mouseY, selectedText) {
    hideSelectionMenu();

    const menu = document.createElement('div');
    menu.id = 'ocr-sel-menu';

    // Keep menu on screen — don't let it go off right edge
    const menuX = Math.min(mouseX, window.innerWidth - 220);
    const menuY = Math.max(mouseY - 55, 10);

    menu.style.left = menuX + 'px';
    menu.style.top  = menuY + 'px';

    menu.innerHTML = `
      <button id="ocr-sel-gemini">🤖 Ask GPT</button>
      <button id="ocr-sel-google">🔍 Google It</button>
    `;
    document.body.appendChild(menu);

    menu.querySelector('#ocr-sel-gemini').onclick = (e) => {
      e.stopPropagation();
      // ChatGPT supports ?q= URL param — text opens pre-filled automatically!
      window.open('https://chatgpt.com/?q=' + encodeURIComponent(selectedText), '_blank');
      hideSelectionMenu();
    };

    menu.querySelector('#ocr-sel-google').onclick = (e) => {
      e.stopPropagation();
      window.open('https://www.google.com/search?q=' + encodeURIComponent(selectedText), '_blank');
      hideSelectionMenu();
    };
  }

  function hideSelectionMenu() {
    const menu = document.getElementById('ocr-sel-menu');
    if (menu) menu.remove();
  }

  // Hide selection menu when clicking anywhere outside it
  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('ocr-sel-menu');
    if (menu && !menu.contains(e.target)) hideSelectionMenu();
  }, true);

  // ── Draggable Popup ───────────────────────────────────────

  function makeDraggable(popup) {
    const header = popup.querySelector('#ocr-popup-header');
    let dragging = false, sx, sy, sl, st;

    header.style.cursor = 'grab';

    header.addEventListener('mousedown', (e) => {
      if (e.target.id === 'ocr-close-btn') return; // don't drag when clicking X
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const rect = popup.getBoundingClientRect();
      sl = rect.left; st = rect.top;
      // Override centered transform positioning to absolute coords
      popup.style.transform = 'none';
      popup.style.left = sl + 'px';
      popup.style.top  = st + 'px';
      header.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      let newLeft = sl + (e.clientX - sx);
      let newTop  = st + (e.clientY - sy);
      // Keep popup inside viewport bounds
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth  - popup.offsetWidth));
      newTop  = Math.max(0, Math.min(newTop,  window.innerHeight - popup.offsetHeight));
      popup.style.left = newLeft + 'px';
      popup.style.top  = newTop  + 'px';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
      if (header) header.style.cursor = 'grab';
    });
  }

  // ── URL Linkify ───────────────────────────────────────────

  function linkifyText(escapedHtml) {
    // Match http/https URLs and www. URLs in already-escaped HTML
    return escapedHtml.replace(/(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/g, (url) => {
      const href = url.startsWith('http') ? url : 'https://' + url;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="ocr-link">${url}</a>`;
    });
  }

  // ── Download HTML Report ──────────────────────────────────

  function downloadReport(text, imageDataUrl) {
    const timestamp = new Date().toLocaleString();
    const imgTag = imageDataUrl
      ? `<div class="img-box"><img src="${imageDataUrl}" alt="Captured region"/></div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OCR Result — ${timestamp}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:780px;margin:40px auto;padding:24px;background:#f7f8fc;color:#1a1a2e}
  h1{font-size:20px;margin-bottom:4px}
  .meta{color:#888;font-size:12px;margin-bottom:24px}
  .img-box{background:#fff;padding:16px;border-radius:12px;margin-bottom:20px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
  img{max-width:100%;border-radius:8px;display:block}
  .text-box{background:#fff;padding:20px 24px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
  .text-label{font-size:11px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:12px;letter-spacing:.5px}
  pre{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.7;margin:0}
  .badge{display:inline-block;background:#7c3aed;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:8px;vertical-align:middle}
</style>
</head>
<body>
  <h1>📋 OCR Result <span class="badge">Image to text converter</span></h1>
  <div class="meta">Captured on ${timestamp}</div>
  ${imgTag}
  <div class="text-box">
    <div class="text-label">Extracted Text</div>
    <pre>${escHtml(text)}</pre>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `ocr-result-${Date.now()}.html`
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showNotification('📥 Downloaded as HTML report!', 'success');
  }

  // ── Notifications ─────────────────────────────────────────

  function showNotification(message, type) {
    const existing = document.getElementById('ocr-notification');
    if (existing) existing.remove();

    const n = document.createElement('div');
    n.id = 'ocr-notification';

    if (type === 'loading') {
      n.className = 'ocr-notif-info';
      n.innerHTML = '<span class="ocr-spinner"></span><span>AI loading...</span>';
    } else {
      n.className = 'ocr-notif-' + (type || 'info');
      n.textContent = message;
    }

    document.body.appendChild(n);

    // Loading stays until replaced; others auto-dismiss after 4s
    if (type !== 'loading') {
      setTimeout(() => n.parentNode && n.remove(), 4000);
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  // Escape HTML special characters to prevent XSS
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Get currently highlighted text from page selection
  function getSelectedText() {
    return window.getSelection().toString().trim();
  }

  // ── Message Listener ──────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startSelection') {
      window.__ocrGrabberListening = false;
      window.__ocrGrabberListening = true;
      startSelectionMode();
      sendResponse({ status: 'started' });
    }
    return true;
  });

})();
