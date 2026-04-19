const express = require('express');
const path = require('path');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const net = require('net');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ОТКЛЮЧАЕМ ПРОВЕРКУ SSL СЕРТИФИКАТОВ (для разработки)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const DEFAULT_PORT = process.env.PORT || 4000;

// ========== MIDDLEWARE ==========
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Настройка сессий
app.use(session({
    secret: process.env.SESSION_SECRET || 'ai-art-studio-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ========== БАЗА ДАННЫХ ==========
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица работ (изображения)
    db.run(`CREATE TABLE IF NOT EXISTS artworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        image_url TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        likes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Таблица сообщений чата
    db.run(`CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Создание администратора
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(
        `INSERT OR IGNORE INTO users (username, password, is_admin) VALUES (?, ?, 1)`,
        ['admin', adminPassword]
    );

    // Тестовые данные для галереи
    db.get("SELECT COUNT(*) as count FROM artworks", (err, row) => {
        if (!err && row.count === 0) {
            const testArtworks = [
                ['Киберпанк город', 'футуристический город в стиле киберпанк, неоновые огни', 
                 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?w=400', 1],
                ['Горный пейзаж', 'величественные горы, туман, рассвет', 
                 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400', 1],
                ['Космическая станция', 'футуристическая космическая станция', 
                 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400', 1]
            ];
            
            const stmt = db.prepare("INSERT INTO artworks (title, prompt, image_url, user_id) VALUES (?, ?, ?, ?)");
            testArtworks.forEach(art => stmt.run(art[0], art[1], art[2], art[3]));
            stmt.finalize();
            console.log('✅ Тестовые данные для галереи добавлены');
        }
    });
});

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Получение GigaChat токена с обработкой SSL ошибок
let gigachatToken = null;
let tokenExpiresAt = 0;

async function getGigaChatToken() {
    try {
        // Проверяем, не истек ли токен (30 минут)
        if (gigachatToken && tokenExpiresAt > Date.now()) {
            console.log('🔄 Используем существующий GigaChat токен');
            return gigachatToken;
        }

        if (!process.env.GIGACHAT_AUTH_KEY) {
            console.error('❌ GIGACHAT_AUTH_KEY не настроен в .env');
            return null;
        }

        console.log('🔄 Получение нового GigaChat токена...');
        console.log('📤 Client ID:', process.env.GIGACHAT_CLIENT_ID || 'не указан');

        // Генерируем RqUID (уникальный идентификатор запроса)
        const rqUid = uuidv4();
        
        // Создаем HTTPS агент с отключенной проверкой сертификата
        const https = require('https');
        const agent = new https.Agent({
            rejectUnauthorized: false,
            secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT
        });

        // Отправляем запрос на получение токена
        const response = await axios.post(
            'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
            new URLSearchParams({ 
                scope: process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS' 
            }),
            {
                headers: {
                    'Authorization': `Basic ${process.env.GIGACHAT_AUTH_KEY}`,
                    'RqUID': rqUid,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                httpsAgent: agent,
                timeout: 30000
            }
        );

        console.log('✅ Ответ от GigaChat получен');
        
        if (response.data && response.data.access_token) {
            gigachatToken = response.data.access_token;
            tokenExpiresAt = response.data.expires_at * 1000;
            
            console.log('✅ GigaChat токен получен, истекает:', new Date(tokenExpiresAt).toLocaleString());
            return gigachatToken;
        } else {
            console.error('❌ Неожиданный формат ответа:', response.data);
            return null;
        }
    } catch (error) {
        console.error('❌ Ошибка получения GigaChat токена:', error.message);
        return null;
    }
}

// ========== API МАРШРУТЫ АВТОРИЗАЦИИ ==========

// Проверка здоровья
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        airail_configured: !!process.env.AIR_FAIL_API_KEY,
        gigachat_configured: !!process.env.GIGACHAT_AUTH_KEY,
        authenticated: !!req.session.userId
    });
});

// Проверка сессии
app.get('/api/session', (req, res) => {
    res.json({
        authenticated: !!req.session.userId,
        userId: req.session.userId || null,
        username: req.session.username || null,
        isAdmin: req.session.isAdmin || false
    });
});

// Регистрация
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            [username, hashedPassword],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Пользователь уже существует' });
                    }
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }

                req.session.userId = this.lastID;
                req.session.username = username;
                req.session.isAdmin = false;

                res.json({ 
                    success: true, 
                    username: username,
                    isAdmin: false
                });
            }
        );
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        try {
            const match = await bcrypt.compare(password, user.password);
            
            if (match) {
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.isAdmin = user.is_admin === 1;

                res.json({ 
                    success: true, 
                    username: user.username,
                    isAdmin: user.is_admin === 1
                });
            } else {
                res.status(401).json({ error: 'Неверный логин или пароль' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Ошибка сервера' });
        }
    });
});

// Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ========== МАРШРУТЫ ДЛЯ ГАЛЕРЕИ ==========

// Получение всех работ
app.get('/api/artworks', (req, res) => {
    db.all(
        `SELECT artworks.*, users.username 
         FROM artworks 
         JOIN users ON artworks.user_id = users.id 
         ORDER BY artworks.created_at DESC`,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Создание новой работы
app.post('/api/artworks', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { title, prompt, imageUrl } = req.body;

    if (!title || !prompt || !imageUrl) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }

    db.run(
        "INSERT INTO artworks (title, prompt, image_url, user_id) VALUES (?, ?, ?, ?)",
        [title, prompt, imageUrl, req.session.userId],
        function(err) {
            if (err) {
                console.error('Error creating artwork:', err);
                return res.status(500).json({ error: 'Ошибка при сохранении работы' });
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

// Лайк работы
app.post('/api/artworks/:id/like', (req, res) => {
    const { id } = req.params;

    db.run(
        "UPDATE artworks SET likes = likes + 1 WHERE id = ?",
        [id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            db.get("SELECT likes FROM artworks WHERE id = ?", [id], (err, row) => {
                res.json({ likes: row.likes });
            });
        }
    );
});

// ========== АДМИН МАРШРУТЫ ==========

const requireAdmin = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    next();
};

// Админ: получение всех работ
app.get('/api/admin/artworks', requireAdmin, (req, res) => {
    db.all(
        `SELECT artworks.*, users.username 
         FROM artworks 
         JOIN users ON artworks.user_id = users.id 
         ORDER BY artworks.created_at DESC`,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Админ: удаление работы
app.delete('/api/admin/artworks/:id', requireAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM artworks WHERE id = ?", [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// Админ: получение всех пользователей
app.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all(
        "SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC",
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// ========== GIGACHAT API МАРШРУТЫ ==========

// Тестовый маршрут для проверки GigaChat
app.get('/api/gigachat/test', async (req, res) => {
    try {
        const token = await getGigaChatToken();
        
        if (!token) {
            return res.json({ 
                success: false, 
                error: 'Не удалось получить токен',
                auth_key_configured: !!process.env.GIGACHAT_AUTH_KEY,
                client_id: process.env.GIGACHAT_CLIENT_ID || 'не указан'
            });
        }

        // Пробуем получить список моделей
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });

        const modelsResponse = await axios.get(
            'https://gigachat.devices.sberbank.ru/api/v1/models',
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                httpsAgent: agent,
                timeout: 10000
            }
        );

        res.json({
            success: true,
            message: '✅ GigaChat подключен',
            token_expires_at: new Date(tokenExpiresAt).toLocaleString(),
            models: modelsResponse.data
        });

    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message,
            response: error.response?.data
        });
    }
});

// Отправка сообщения в GigaChat
app.post('/api/gigachat/chat', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { message, history } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Введите сообщение' });
    }

    try {
        const token = await getGigaChatToken();
        if (!token) {
            return res.status(500).json({ 
                error: 'Не удалось получить токен GigaChat',
                details: 'Проверьте настройки GIGACHAT_AUTH_KEY в .env файле'
            });
        }

        // Формируем историю сообщений
        const messages = [];
        
        messages.push({
            role: 'system',
            content: 'Ты — полезный ассистент GigaChat. Отвечай на вопросы пользователя подробно и по существу. Используй русский язык.'
        });

        if (history && Array.isArray(history)) {
            const recentHistory = history.slice(-10);
            recentHistory.forEach(msg => {
                if (msg.role !== 'system') {
                    messages.push({
                        role: msg.role,
                        content: msg.content
                    });
                }
            });
        }

        messages.push({
            role: 'user',
            content: message
        });

        console.log('📤 Отправка запроса к GigaChat');
        console.log('📤 Сообщений в контексте:', messages.length);

        // Создаем HTTPS агент с отключенной проверкой
        const https = require('https');
        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        const requestId = uuidv4();

        const response = await axios.post(
            'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
            {
                model: 'GigaChat-2-Max',
                messages: messages,
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Request-ID': requestId,
                    'X-Session-ID': req.session.userId.toString()
                },
                httpsAgent: agent,
                timeout: 60000
            }
        );

        console.log('✅ Ответ от GigaChat получен');
        
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            const reply = response.data.choices[0].message.content;
            
            // Сохраняем в историю
            db.run(
                "INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)",
                [req.session.userId, 'user', message]
            );
            
            db.run(
                "INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)",
                [req.session.userId, 'assistant', reply]
            );

            if (response.data.usage) {
                console.log('📊 Токены:', {
                    prompt: response.data.usage.prompt_tokens,
                    completion: response.data.usage.completion_tokens,
                    total: response.data.usage.total_tokens
                });
            }
            
            res.json({ 
                reply: reply,
                usage: response.data.usage
            });
        } else {
            throw new Error('Неожиданный формат ответа от GigaChat');
        }

    } catch (error) {
        console.error('❌ Ошибка GigaChat:', error.message);
        
        if (error.response) {
            console.error('Статус:', error.response.status);
            console.error('Данные:', error.response.data);
            
            if (error.response.status === 401) {
                gigachatToken = null;
            }
        }
        
        res.status(500).json({ 
            error: 'Ошибка при обращении к GigaChat',
            details: error.message
        });
    }
});

// Получение истории чата
app.get('/api/gigachat/history', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    db.all(
        "SELECT role, content, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at ASC LIMIT 50",
        [req.session.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Очистка истории чата
app.delete('/api/gigachat/history', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    db.run(
        "DELETE FROM chat_history WHERE user_id = ?",
        [req.session.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

// ========== ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ ЧЕРЕЗ AIR.FAIL ==========

const DEMO_IMAGES = [
    'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?w=400',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400',
    'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400',
    'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=400',
    'https://images.unsplash.com/photo-1582967788606-a171d1080cb0?w=400'
];

// Генерация через air.fail API
app.post('/api/generate', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Введите описание изображения' });
    }

    if (!process.env.AIR_FAIL_API_KEY) {
        console.log('⚠️ API ключ air.fail не настроен, используется демо-режим');
        const randomImage = DEMO_IMAGES[Math.floor(Math.random() * DEMO_IMAGES.length)];
        return res.json({ 
            imageUrl: randomImage,
            prompt: prompt,
            demo: true,
            message: 'API ключ air.fail не настроен'
        });
    }

    try {
        console.log('🎨 Генерация через air.fail для промпта:', prompt);

        const formData = new FormData();
        formData.append('content', prompt);
        formData.append('info', JSON.stringify({
            version: "flux-schnell",
            num_outputs: 1,
            num_inference_steps: 4,
            megapixels: "1",
            aspect_ratio: "1:1"
        }));

        const response = await axios.post('https://api.air.fail/public/image/flux', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': process.env.AIR_FAIL_API_KEY
            },
            timeout: 120000
        });

        let imageUrl = null;

        if (Array.isArray(response.data) && response.data.length > 0) {
            const firstItem = response.data[0];
            if (firstItem.file) {
                imageUrl = firstItem.file;
                console.log('✅ URL изображения получен:', imageUrl);
            }
        }

        if (imageUrl) {
            res.json({ 
                imageUrl: imageUrl,
                prompt: prompt,
                demo: false,
                source: 'air.fail'
            });
        } else {
            console.error('❌ Не удалось получить URL из ответа:', response.data);
            throw new Error('Не удалось получить URL изображения');
        }

    } catch (error) {
        console.error('❌ Ошибка генерации:', error.message);
        const randomImage = DEMO_IMAGES[Math.floor(Math.random() * DEMO_IMAGES.length)];
        res.json({ 
            imageUrl: randomImage,
            prompt: prompt,
            demo: true,
            error: error.message
        });
    }
});

// ========== ДИАГНОСТИКА SSL ==========
app.get('/api/diagnose-ssl', async (req, res) => {
    const results = {
        node_version: process.version,
        platform: process.platform,
        timestamp: new Date().toISOString(),
        env: {
            GIGACHAT_AUTH_KEY: process.env.GIGACHAT_AUTH_KEY ? 'установлен' : 'не установлен',
            GIGACHAT_CLIENT_ID: process.env.GIGACHAT_CLIENT_ID || 'не указан',
            GIGACHAT_SCOPE: process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS'
        },
        tests: []
    };

    // Тест: Проверка соединения
    try {
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        const response = await axios.get('https://ngw.devices.sberbank.ru:9443', {
            httpsAgent: agent,
            timeout: 10000,
            validateStatus: false
        });
        
        results.tests.push({ 
            name: 'SSL Connection', 
            success: true, 
            status: response.status 
        });
    } catch (err) {
        results.tests.push({ 
            name: 'SSL Connection', 
            success: false, 
            error: err.message 
        });
    }

    res.json(results);
});

// ========== СТАТИЧЕСКИЕ ФАЙЛЫ ==========
app.use(express.static(path.join(__dirname, 'public')));

// ========== HTML СТРАНИЦЫ ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/gallery', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/admin', (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// ========== 404 ==========
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Маршрут не найден' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ========== ОБРАБОТКА ОШИБОК ==========
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
    
    res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

// ========== ПОИСК СВОБОДНОГО ПОРТА ==========
function findAvailablePort(startPort, callback) {
    const server = net.createServer();
    
    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ Порт ${startPort} занят, пробуем ${startPort + 1}...`);
            findAvailablePort(startPort + 1, callback);
        } else {
            callback(startPort);
        }
    });

    server.once('listening', () => {
        server.close(() => {
            callback(startPort);
        });
    });

    server.listen(startPort);
}

// ========== ЗАПУСК СЕРВЕРА ==========
findAvailablePort(DEFAULT_PORT, (port) => {
    app.listen(port, () => {
        console.log('\n' + '='.repeat(70));
        console.log('🚀 AI ART STUDIO с GigaChat и air.fail');
        console.log('='.repeat(70));
        console.log(`📱 Адрес: http://localhost:${port}`);
        console.log(`👤 Админ: admin / admin123`);
        console.log(`🎨 air.fail: ${process.env.AIR_FAIL_API_KEY ? '✅ Подключен' : '❌ Не настроен'}`);
        console.log(`💬 GigaChat: ${process.env.GIGACHAT_AUTH_KEY ? '✅ Подключен' : '❌ Не настроен'}`);
        console.log('='.repeat(70));
        console.log('\n📝 Доступные страницы:');
        console.log(`   /      - Главная (генерация изображений)`);
        console.log(`   /chat  - Чат с GigaChat`);
        console.log(`   /gallery - Галерея изображений`);
        console.log(`   /admin - Админ-панель`);
        console.log('='.repeat(70));
        console.log('\n🔍 Тестовые эндпоинты:');
        console.log(`   GET  /api/health - проверка сервера`);
        console.log(`   GET  /api/gigachat/test - проверка GigaChat`);
        console.log(`   GET  /api/diagnose-ssl - диагностика SSL`);
        console.log('='.repeat(70) + '\n');
    });
});

// Корректное завершение
process.on('SIGINT', () => {
    console.log('\n👋 Завершение работы сервера...');
    db.close((err) => {
        if (err) {
            console.error('Ошибка при закрытии БД:', err);
        } else {
            console.log('✅ База данных закрыта');
        }
        process.exit(0);
    });
});

module.exports = app;

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});