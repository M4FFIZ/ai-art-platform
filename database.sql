-- SQLite dump

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица работ
CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    image_url TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_artworks_user_id ON artworks(user_id);
CREATE INDEX IF NOT EXISTS idx_artworks_created_at ON artworks(created_at);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Администратор (пароль: admin123)
INSERT OR IGNORE INTO users (username, password, is_admin) 
VALUES ('admin', '$2b$10$YourHashedPasswordHere', 1);

-- Тестовые данные
INSERT OR IGNORE INTO artworks (title, prompt, image_url, user_id, likes) VALUES 
('Киберпанк город', 'футуристический город в стиле киберпанк, неоновые огни, дождь', 
 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?w=400', 1, 15),
('Горный пейзаж', 'величественные горы, туман, рассвет, альпийские луга', 
 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400', 1, 23),
('Космическая станция', 'футуристическая космическая станция на орбите Юпитера', 
 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400', 1, 8);