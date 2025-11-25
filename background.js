console.log('Notiq background script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Notiq Background] Received message:', request.action);
  
  if (request.action === 'INJECT_SCRIPT') {
    console.log('[Notiq Background] Injecting script into tab:', sender.tab.id);

    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: (code) => {
        console.log('[Notiq MAIN] Executing SDK code...');
        try {
          const fn = new Function(code);
          fn();
          console.log('[Notiq MAIN] SDK code executed successfully');
        } catch (e) {
          console.error('[Notiq MAIN] SDK execution error:', e);
        }
      },
      args: [request.code],
      world: 'MAIN'
    })
    .then(() => {
      console.log('[Notiq Background] SDK injection success');
      sendResponse({ status: 'success' });
    })
    .catch(err => {
      console.error('[Notiq Background] SDK injection failed:', err);
      sendResponse({ status: 'error', error: err.message });
    });

    return true;
  }

  // PROXY_FETCH - для запросов SDK к серверу
  if (request.action === 'PROXY_FETCH') {
    console.log('[Notiq Background] Proxy fetch:', request.url);
    
    fetch(request.url, request.options || {})
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        console.log('[Notiq Background] Proxy response received');
        sendResponse({ data });
      })
      .catch(err => {
        console.error('[Notiq Background] Proxy error:', err);
        sendResponse({ error: err.message });
      });
      
    return true;
  }

  // NOTIQ_SAVE_NOTE - для сохранения заметок
  if (request.action === 'NOTIQ_SAVE_NOTE') {
    chrome.storage.local.get(['notes'], (result) => {
      const notes = result.notes || [];
      const newNote = {
        id: Date.now(),
        text: request.text,
        date: new Date().toISOString()
      };
      const updatedNotes = [...notes, newNote];
      
      chrome.storage.local.set({ notes: updatedNotes }, () => {
        console.log('[Notiq Background] Note saved:', newNote.id);
        sendResponse({ status: 'success', note: newNote });
      });
    });
    return true;
  }

  sendResponse({ status: 'unknown_action' });
  return true;
});

// Инициализация расширения
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notiq extension installed');
  // Устанавливаем настройки по умолчанию
  chrome.storage.local.set({
    stickyEnabled: true,
    stickyColor: '#fff740',
    notes: []
  });
});