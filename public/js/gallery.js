// Состояние галереи
let allArtworks = [];
let currentUser = null;

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

// Загрузка всех работ
async function loadAllArtworks() {
    const loading = document.getElementById('loading');
    const gallery = document.getElementById('gallery');
    const noResults = document.getElementById('noResults');
    
    loading.style.display = 'block';
    gallery.style.display = 'none';
    noResults.style.display = 'none';
    
    try {
        const response = await fetch('/api/artworks');
        allArtworks = await response.json();
        
        loading.style.display = 'none';
        gallery.style.display = 'grid';
        
        if (allArtworks.length === 0) {
            noResults.style.display = 'block';
            return;
        }
        
        displayArtworks(allArtworks);
    } catch (error) {
        console.error('Error loading gallery:', error);
        loading.style.display = 'none';
    }
}

// Отображение работ
function displayArtworks(artworks) {
    const gallery = document.getElementById('gallery');
    
    if (artworks.length === 0) {
        document.getElementById('noResults').style.display = 'block';
        gallery.style.display = 'none';
        return;
    }
    
    document.getElementById('noResults').style.display = 'none';
    gallery.style.display = 'grid';
    
    gallery.innerHTML = artworks.map(art => `
        <div class="art-card" data-id="${art.id}">
            <img src="${art.image_url}" alt="${art.title}" class="art-image" 
                 onerror="this.src='https://via.placeholder.com/400x300?text=Image+not+found'">
            <div class="art-info">
                <h3 class="art-title">${escapeHtml(art.title)}</h3>
                <p class="art-prompt">${escapeHtml(art.prompt.substring(0, 100))}${art.prompt.length > 100 ? '...' : ''}</p>
                <div class="art-footer">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="color: #94a3b8;">👤 ${escapeHtml(art.username)}</span>
                        <span style="color: #94a3b8;">📅 ${formatDate(art.created_at)}</span>
                    </div>
                    <button onclick="likeArtwork(${art.id})" class="like-btn" 
                            ${!currentUser ? 'disabled' : ''}>
                        ❤️ <span id="likes-${art.id}">${art.likes}</span>
                    </button>
                </div>
                ${currentUser?.isAdmin ? `
                    <button onclick="deleteArtwork(${art.id})" 
                            style="margin-top: 1rem; background: #ef4444; width: 100%;"
                            class="btn btn-primary">
                        Удалить
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Защита от XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Форматирование даты
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
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

// Удаление работы (только для админа)
async function deleteArtwork(id) {
    if (!confirm('Удалить эту работу?')) return;
    
    try {
        const response = await fetch(`/api/admin/artworks/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadAllArtworks();
        }
    } catch (error) {
        alert('Ошибка при удалении');
    }
}

// Фильтрация и сортировка
function filterAndSortArtworks() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortBy = document.getElementById('sortSelect').value;
    
    let filtered = allArtworks.filter(art => 
        art.title.toLowerCase().includes(searchTerm) || 
        art.prompt.toLowerCase().includes(searchTerm) ||
        art.username.toLowerCase().includes(searchTerm)
    );
    
    switch(sortBy) {
        case 'newest':
            filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        case 'oldest':
            filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'popular':
            filtered.sort((a, b) => b.likes - a.likes);
            break;
    }
    
    displayArtworks(filtered);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadAllArtworks();
    
    document.getElementById('searchInput').addEventListener('input', filterAndSortArtworks);
    document.getElementById('sortSelect').addEventListener('change', filterAndSortArtworks);
});