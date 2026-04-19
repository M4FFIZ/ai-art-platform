// Состояние чата
let currentUser = null;
let messageHistory = [];

// Проверка авторизации
async function checkAuth() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data;
            document.getElementById('login-link').textContent = 'Выйти';
            document.getElementById('login-link').href = '#';
            document.getElementById('login-link').onclick = logout;
            
            if (data.isAdmin) {
                document.getElementById('admin-link').style.display = 'inline-block';
            }
            
            // Загружаем историю чата
            loadChatHistory();
        } else {
            // Если не авторизован, показываем сообщение
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = `
                <div class="message system">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Для использования чата необходимо <a href="/login" style="color: var(--gigachat);">войти</a>
                </div>
            `;
            document.getElementById('chatInput').disabled = true;
            document.getElementById('sendBtn').disabled = true;
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Выход
async function logout(e) {
    e.preventDefault();
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
}

// Загрузка истории чата
async function loadChatHistory() {
    try {
        const response = await fetch('/api/gigachat/history');
        const history = await response.json();
        
        messageHistory = history.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        
        displayMessages();
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Отображение сообщений
function displayMessages() {
    const chatMessages = document.getElementById('chatMessages');
    
    if (messageHistory.length === 0) {
        chatMessages.innerHTML = `
            <div class="message system">
                <i class="fas fa-info-circle"></i> Начните диалог с GigaChat!
            </div>
        `;
        return;
    }
    
    chatMessages.innerHTML = messageHistory.map(msg => `
        <div class="message ${msg.role}">
            <div class="message-content">${escapeHtml(msg.content)}</div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `).join('');
    
    // Прокрутка вниз
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Отправка сообщения
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    if (!currentUser) {
        alert('Необходимо авторизоваться');
        window.location.href = '/login';
        return;
    }
    
    // Очищаем input
    input.value = '';
    
    // Добавляем сообщение пользователя в историю
    messageHistory.push({
        role: 'user',
        content: message
    });
    
    // Отображаем сообщения
    displayMessages();
    
    // Показываем индикатор печати
    showTypingIndicator();
    
    try {
        // Отправляем запрос
        const response = await fetch('/api/gigachat/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                history: messageHistory.slice(0, -1) // история без последнего сообщения
            })
        });
        
        const data = await response.json();
        
        // Убираем индикатор печати
        hideTypingIndicator();
        
        if (response.ok && data.reply) {
            // Добавляем ответ ассистента
            messageHistory.push({
                role: 'assistant',
                content: data.reply
            });
            
            displayMessages();
        } else {
            throw new Error(data.error || 'Ошибка при получении ответа');
        }
        
    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        
        // Показываем ошибку
        messageHistory.push({
            role: 'system',
            content: '❌ Ошибка: ' + error.message
        });
        
        displayMessages();
    }
}

// Показ индикатора печати
function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Скрытие индикатора печати
function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Очистка чата
async function clearChat() {
    if (!confirm('Очистить историю чата?')) return;
    
    try {
        const response = await fetch('/api/gigachat/history', {
            method: 'DELETE'
        });
        
        if (response.ok) {
            messageHistory = [];
            displayMessages();
        }
    } catch (error) {
        console.error('Error clearing chat:', error);
        alert('Ошибка при очистке чата');
    }
}

// Обработка нажатия Enter
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Защита от XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});