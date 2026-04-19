// Состояние приложения
let currentUser = null;
let generatedImageUrl = null;
let currentPrompt = '';

// Проверка авторизации
async function checkAuth() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data;
            document.getElementById('login-link').innerHTML = '<i class="fas fa-sign-out-alt"></i> Выйти';
            document.getElementById('login-link').href = '#';
            document.getElementById('login-link').onclick = logout;
          if (data.authenticated) {
    // ... существующий код
    document.getElementById('register-link').style.display = 'none';
}  
            
            if (data.isAdmin) {
                document.getElementById('admin-link').style.display = 'inline-block';
            }
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

// Генерация изображения
async function generateImage() {
    const prompt = document.getElementById('prompt').value;
    
    if (!prompt) {
        alert('Введите описание изображения');
        return;
    }

    if (!currentUser) {
        alert('Для генерации изображений необходимо войти');
        window.location.href = '/login';
        return;
    }

    const generateBtn = document.getElementById('generateBtn');
    const loading = document.getElementById('loading');
    
    generateBtn.disabled = true;
    loading.style.display = 'block';
    currentPrompt = prompt;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const data = await response.json();
        
        if (data.imageUrl) {
            generatedImageUrl = data.imageUrl;
            document.getElementById('generatedImage').src = data.imageUrl;
            
            const apiInfo = document.getElementById('apiInfo');
            apiInfo.style.display = 'block';
            apiInfo.className = 'api-info airfail';
            apiInfo.innerHTML = data.demo 
                ? '⚠️ Демо-режим: ' + (data.message || 'Тестовое изображение')
                : '✅ Сгенерировано через air.fail (Flux Schnell)';
            
            document.getElementById('resultModal').classList.add('active');
        }
    } catch (error) {
        console.error('Ошибка генерации:', error);
        alert('Ошибка при генерации изображения');
    } finally {
        generateBtn.disabled = false;
        loading.style.display = 'none';
    }
}

// Сохранение в галерею
async function saveToGallery() {
    const title = document.getElementById('imageTitle').value;
    const prompt = currentPrompt;

    if (!title) {
        alert('Введите название работы');
        return;
    }

    try {
        const response = await fetch('/api/artworks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                prompt,
                imageUrl: generatedImageUrl
            })
        });

        if (response.ok) {
            alert('✅ Работа опубликована в галерее!');
            closeModal();
            loadGallery();
            document.getElementById('prompt').value = '';
            document.getElementById('imageTitle').value = '';
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        alert('Ошибка при сохранении');
    }
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('resultModal').classList.remove('active');
    document.getElementById('apiInfo').style.display = 'none';
}

// Загрузка галереи
async function loadGallery() {
    try {
        const response = await fetch('/api/artworks');
        const artworks = await response.json();
        
        const gallery = document.getElementById('gallery');
        if (!gallery) return;
        
        if (artworks.length === 0) {
            gallery.innerHTML = '<div style="text-align: center; padding: 2rem; color: #94a3b8;">Пока нет работ</div>';
            return;
        }
        
        gallery.innerHTML = artworks.map(art => `
            <div class="art-card">
                <img src="${art.image_url}" alt="${escapeHtml(art.title)}" class="art-image">
                <div class="art-info">
                    <h3 class="art-title">${escapeHtml(art.title)}</h3>
                    <p class="art-prompt">${escapeHtml(art.prompt.substring(0, 100))}...</p>
                    <div class="art-footer">
                        <span><i class="fas fa-user"></i> ${escapeHtml(art.username)}</span>
                        <button onclick="likeArtwork(${art.id})" class="like-btn" 
                                ${!currentUser ? 'disabled' : ''}>
                            <i class="fas fa-heart"></i> <span id="likes-${art.id}">${art.likes}</span>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

// Лайк
async function likeArtwork(id) {
    if (!currentUser) {
        alert('Войдите, чтобы ставить лайки');
        return;
    }
    
    try {
        const response = await fetch(`/api/artworks/${id}/like`, {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById(`likes-${id}`).textContent = data.likes;
        }
    } catch (error) {
        console.error('Error liking artwork:', error);
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
    loadGallery();
});