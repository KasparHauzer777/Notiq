document.addEventListener('DOMContentLoaded', async () => {
    const toggleSticky = document.getElementById('toggleSticky');
    const colorSelect = document.getElementById('colorSelect');
    const newNoteBtn = document.getElementById('newNote');
    const notesList = document.getElementById('notesList');

    // Загрузка настроек
    const settings = await chrome.storage.local.get(['stickyEnabled', 'stickyColor', 'notes']);
    toggleSticky.checked = settings.stickyEnabled !== false;
    colorSelect.value = settings.stickyColor || '#fff740';
    
    // Отображение списка заметок
    displayNotes(settings.notes || []);

    // Переключение стикера
    toggleSticky.addEventListener('change', (e) => {
        chrome.storage.local.set({ stickyEnabled: e.target.checked });
        updateContentScript();
    });

    // Смена цвета
    colorSelect.addEventListener('change', (e) => {
        chrome.storage.local.set({ stickyColor: e.target.value });
        updateContentScript();
    });

    // Новая заметка
    newNoteBtn.addEventListener('click', () => {
        const noteText = prompt('Введите текст заметки:');
        if (noteText && noteText.trim()) {
            saveNewNote(noteText.trim());
        }
    });

    function displayNotes(notes) {
        notesList.innerHTML = '';
        notes.slice(-5).reverse().forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'note-item';
            noteEl.innerHTML = `
                <div class="note-text">${note.text}</div>
                <div class="note-date">${new Date(note.date).toLocaleDateString()}</div>
            `;
            noteEl.addEventListener('click', () => {
                if (confirm('Удалить эту заметку?')) {
                    deleteNote(note.id);
                }
            });
            notesList.appendChild(noteEl);
        });
    }

    async function saveNewNote(text) {
        const { notes = [] } = await chrome.storage.local.get('notes');
        const newNote = {
            id: Date.now(),
            text: text,
            date: new Date().toISOString()
        };
        const updatedNotes = [...notes, newNote];
        await chrome.storage.local.set({ notes: updatedNotes });
        displayNotes(updatedNotes);
    }

    async function deleteNote(noteId) {
        const { notes = [] } = await chrome.storage.local.get('notes');
        const updatedNotes = notes.filter(note => note.id !== noteId);
        await chrome.storage.local.set({ notes: updatedNotes });
        displayNotes(updatedNotes);
    }

    function updateContentScript() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { 
                    action: 'UPDATE_STICKY',
                    settings: {
                        stickyEnabled: toggleSticky.checked,
                        stickyColor: colorSelect.value
                    }
                });
            }
        });
    }
});