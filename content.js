(function() {
    'use strict';

    let stickyNote = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    async function initStickyNote() {
        const settings = await chrome.storage.local.get(['stickyEnabled', 'stickyColor', 'notes']);
        
        if (settings.stickyEnabled === false) {
            removeStickyNote();
            return;
        }

        createStickyNote(settings);
    }

    function createStickyNote(settings) {
        if (stickyNote) return;

        const latestNote = settings.notes?.[settings.notes.length - 1]?.text || 'Напишите вашу заметку здесь...';

        stickyNote = document.createElement('div');
        stickyNote.innerHTML = `
            <div class="sticky-header">
                <span class="sticky-title">Notiq</span>
                <div class="sticky-controls">
                    <button class="sticky-btn" id="minimizeBtn">−</button>
                    <button class="sticky-btn" id="closeBtn">×</button>
                </div>
            </div>
            <textarea class="sticky-textarea" placeholder="Напишите вашу заметку здесь...">${latestNote}</textarea>
            <div class="sticky-footer">
                <button class="sticky-save-btn">Сохранить</button>
            </div>
        `;

        Object.assign(stickyNote.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '300px',
            background: settings.stickyColor || '#fff740',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            zIndex: '10000',
            fontFamily: 'Arial, sans-serif',
            border: '1px solid rgba(255,255,255,0.2)',
            overflow: 'hidden'
        });

        // Стили для заголовка
        const header = stickyNote.querySelector('.sticky-header');
        Object.assign(header.style, {
            background: 'rgba(0,0,0,0.1)',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'move',
            userSelect: 'none'
        });

        // Стили для текстовой области
        const textarea = stickyNote.querySelector('.sticky-textarea');
        Object.assign(textarea.style, {
            width: '100%',
            height: '200px',
            border: 'none',
            background: 'transparent',
            padding: '16px',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: '14px',
            lineHeight: '1.4'
        });

        // Стили для футера
        const footer = stickyNote.querySelector('.sticky-footer');
        Object.assign(footer.style, {
            padding: '12px 16px',
            background: 'rgba(0,0,0,0.05)',
            textAlign: 'right'
        });

        const saveBtn = stickyNote.querySelector('.sticky-save-btn');
        Object.assign(saveBtn.style, {
            background: '#667eea',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
        });

        // Обработчики событий
        setupEventHandlers();
        
        document.body.appendChild(stickyNote);
    }

    function setupEventHandlers() {
        const header = stickyNote.querySelector('.sticky-header');
        const textarea = stickyNote.querySelector('.sticky-textarea');
        const saveBtn = stickyNote.querySelector('.sticky-save-btn');
        const closeBtn = stickyNote.querySelector('#closeBtn');
        const minimizeBtn = stickyNote.querySelector('#minimizeBtn');

        // Перетаскивание
        header.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);

        // Сохранение заметки
        saveBtn.addEventListener('click', saveNote);

        // Закрытие
        closeBtn.addEventListener('click', removeStickyNote);

        // Сворачивание
        minimizeBtn.addEventListener('click', () => {
            const textarea = stickyNote.querySelector('.sticky-textarea');
            const footer = stickyNote.querySelector('.sticky-footer');
            const isMinimized = textarea.style.display === 'none';
            
            textarea.style.display = isMinimized ? 'block' : 'none';
            footer.style.display = isMinimized ? 'block' : 'none';
            stickyNote.style.height = isMinimized ? 'auto' : 'fit-content';
        });
    }

    function startDrag(e) {
        if (e.target.closest('.sticky-controls')) return;
        
        isDragging = true;
        const rect = stickyNote.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        stickyNote.style.cursor = 'grabbing';
    }

    function drag(e) {
        if (!isDragging) return;
        
        stickyNote.style.left = (e.clientX - dragOffset.x) + 'px';
        stickyNote.style.top = (e.clientY - dragOffset.y) + 'px';
        stickyNote.style.right = 'auto';
    }

    function stopDrag() {
        isDragging = false;
        stickyNote.style.cursor = 'grab';
    }

    async function saveNote() {
        const textarea = stickyNote.querySelector('.sticky-textarea');
        const noteText = textarea.value.trim();
        
        if (noteText) {
            const { notes = [] } = await chrome.storage.local.get('notes');
            const newNote = {
                id: Date.now(),
                text: noteText,
                date: new Date().toISOString()
            };
            await chrome.storage.local.set({ notes: [...notes, newNote] });
            
            // Визуальное подтверждение
            const saveBtn = stickyNote.querySelector('.sticky-save-btn');
            saveBtn.textContent = 'Сохранено!';
            setTimeout(() => {
                saveBtn.textContent = 'Сохранить';
            }, 1000);
        }
    }

    function removeStickyNote() {
        if (stickyNote) {
            stickyNote.remove();
            stickyNote = null;
        }
    }

    // Инициализация при загрузке
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStickyNote);
    } else {
        initStickyNote();
    }

    // Обработчик сообщений из popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'UPDATE_STICKY') {
            chrome.storage.local.set(request.settings);
            if (!request.settings.stickyEnabled) {
                removeStickyNote();
            } else if (!stickyNote) {
                initStickyNote();
            }
        }
    });

})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_SDK_STATUS') {
        const status = window.getSDKStatus ? window.getSDKStatus() : 'SDK not available';
        sendResponse(status);
        return true;
    }
    
    if (request.action === 'FORCE_SDK_RELOAD') {
        if (window.forceSDKReload) {
            window.forceSDKReload();
            sendResponse({ status: 'reload triggered' });
        } else {
            sendResponse({ status: 'SDK not available' });
        }
        return true;
    }
});