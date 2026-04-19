/**
 * @file app.js — Главный файл сервера Work Analytics.
 * @description Настраивает Express-приложение: статику, CORS, API-роуты и SSE.
 *              Запускает HTTP-сервер на порту из .env (по умолчанию 3000).
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api');
const { ensureDataDirs } = require('./services/storage');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---

/** Парсинг JSON-тела запросов */
app.use(express.json());

/** Раздача статических файлов фронтенда из папки /public */
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Роуты ---

/** Подключение всех API-эндпоинтов (/api/*) */
app.use('/api', apiRouter);

// --- Запуск ---

/**
 * Инициализация сервера:
 * 1. Создаёт директории для данных (data/reports), если их нет.
 * 2. Запускает HTTP-сервер на указанном порту.
 */
async function startServer() {
  try {
    await ensureDataDirs();
    app.listen(PORT, () => {
      console.log(`[Server] ✅ Сервер запущен: http://localhost:${PORT}`);
      console.log(`[Server] 📂 Статика: ${path.join(__dirname, '..', 'public')}`);
    });
  } catch (error) {
    console.error('[Server] ❌ Ошибка при запуске сервера:', error.message);
    process.exit(1);
  }
}

startServer();
