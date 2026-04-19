/**
 * @file api.js — Роутер API-эндпоинтов.
 * @description Определяет REST API и SSE endpoint для взаимодействия фронтенда с сервером.
 *
 * Эндпоинты:
 *   POST   /api/parse        — Запуск нового парсинга (добавление в очередь).
 *   GET    /api/reports       — Список всех сохранённых отчётов (без массива jobs).
 *   GET    /api/reports/:id   — Полный отчёт по ID (с массивом jobs).
 *   DELETE /api/reports/:id   — Удаление отчёта.
 *   GET    /api/events        — SSE-стрим обновлений статуса задач.
 *   GET    /api/queue         — Текущее состояние очереди.
 */

const express = require('express');
const router = express.Router();
const { enqueueTask, getQueueStatus, taskEmitter } = require('../services/queue');
const { listReports, loadReport, deleteReport, deleteAllReports } = require('../services/storage');

/**
 * POST /api/parse — Запуск нового сбора данных.
 * Тело запроса (JSON):
 *   - query {string} — Ключевое слово для поиска (обязательно).
 *   - period {string} — Период ("1day", "3days", "7days", "14days", "30days").
 *   - limit {number} — Максимум вакансий с каждого из 3 источников.
 *
 * @returns {Object} — { success, task: { id, status, query, filters } }
 */
router.post('/parse', (req, res) => {
  const { query, period, limit, sources } = req.body;

  /** Валидация: запрос — обязательное поле */
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    console.warn('[API] ⚠️ Попытка запуска без ключевого слова.');
    return res.status(400).json({
      success: false,
      error: 'Параметр "query" обязателен. Укажите ключевое слово для поиска.',
    });
  }

  /** Приводим лимит к числу (минимум 5, максимум 200) */
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 5), 200);

  console.log(`[API] 🚀 Новый запрос на парсинг: "${query.trim()}", период: ${period || '7days'}, лимит: ${parsedLimit}, источники:`, sources);

  const task = enqueueTask({
    query: query.trim(),
    period: period || '7days',
    limit: parsedLimit,
    sources,
  });

  return res.status(202).json({
    success: true,
    message: 'Задача добавлена в очередь.',
    task: {
      id: task.id,
      status: task.status,
      query: task.query,
      filters: task.filters,
    },
  });
});

/**
 * GET /api/reports — Получение списка всех отчётов.
 * Возвращает метаданные (без массива jobs) для отображения в боковой панели.
 */
router.get('/reports', async (req, res) => {
  try {
    const reports = await listReports();
    console.log(`[API] 📋 Запрос списка отчётов. Найдено: ${reports.length}`);
    return res.json({ success: true, reports });
  } catch (error) {
    console.error('[API] ❌ Ошибка получения списка отчётов:', error.message);
    return res.status(500).json({ success: false, error: 'Ошибка чтения отчётов.' });
  }
});

/**
 * GET /api/reports/:id — Получение полного отчёта по ID.
 * Включает массив jobs для построения графиков.
 */
router.get('/reports/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const report = await loadReport(id);
    if (!report) {
      console.warn(`[API] ⚠️ Отчёт не найден: ${id}`);
      return res.status(404).json({ success: false, error: 'Отчёт не найден.' });
    }
    console.log(`[API] 📖 Загружен отчёт: ${id}`);
    return res.json({ success: true, report });
  } catch (error) {
    console.error(`[API] ❌ Ошибка загрузки отчёта ${id}:`, error.message);
    return res.status(500).json({ success: false, error: 'Ошибка чтения отчёта.' });
  }
});

/**
 * DELETE /api/reports/:id — Удаление отчёта.
 */
router.delete('/reports/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await deleteReport(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Отчёт не найден.' });
    }
    console.log(`[API] 🗑️ Отчёт удалён: ${id}`);
    return res.json({ success: true, message: 'Отчёт удалён.' });
  } catch (error) {
    console.error(`[API] ❌ Ошибка удаления отчёта ${id}:`, error.message);
    return res.status(500).json({ success: false, error: 'Ошибка удаления отчёта.' });
  }
});

/**
 * DELETE /api/reports — Удаление ВСЕХ отчётов.
 */
router.delete('/reports', async (req, res) => {
  try {
    const count = await deleteAllReports();
    return res.json({ success: true, count, message: `Удалено отчётов: ${count}` });
  } catch (error) {
    console.error('[API] ❌ Ошибка массового удаления:', error.message);
    return res.status(500).json({ success: false, error: 'Ошибка массового удаления отчётов.' });
  }
});

/**
 * GET /api/events — SSE (Server-Sent Events) стрим.
 * Фронтенд подключается через new EventSource('/api/events') и
 * получает обновления статуса задач в реальном времени.
 *
 * Формат событий:
 *   event: taskUpdate
 *   data: { id, status, step?, reportId?, errors?, error? }
 */
router.get('/events', (req, res) => {
  console.log('[API] 📡 Новое SSE-подключение.');

  /** Настраиваем заголовки для SSE */
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Отключаем буферизацию nginx (если используется)
  });

  /** Отправляем текущее состояние очереди при подключении */
  const queueStatus = getQueueStatus();
  res.write(`event: queueStatus\ndata: ${JSON.stringify(queueStatus)}\n\n`);

  /** Слушаем обновления задач */
  const onTaskUpdate = (task) => {
    res.write(`event: taskUpdate\ndata: ${JSON.stringify(task)}\n\n`);
  };

  taskEmitter.on('taskUpdate', onTaskUpdate);

  /** Heartbeat каждые 30 секунд (чтобы соединение не отваливалось) */
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  /** Очистка при отключении клиента */
  req.on('close', () => {
    console.log('[API] 📡 SSE-подключение закрыто.');
    taskEmitter.off('taskUpdate', onTaskUpdate);
    clearInterval(heartbeat);
  });
});

/**
 * GET /api/queue — Текущее состояние очереди задач.
 */
router.get('/queue', (req, res) => {
  const status = getQueueStatus();
  return res.json({ success: true, ...status });
});

/**
 * GET /api/status — Статус конфигурации API-ключей.
 * Возвращает информацию о настроенности Gemini и Currency API
 * без раскрытия самих ключей (безопасность).
 */
router.get('/status', (req, res) => {
  /** Gemini API */
  const geminiKeysStr = process.env.GEMINI_API_KEYS || '';
  const geminiKeys = geminiKeysStr.split(',').map((k) => k.trim()).filter(Boolean);

  /** Currency API */
  const currencyKeysStr = process.env.EXCHANGE_RATE_API_KEYS || '';
  const currencyKeys = currencyKeysStr.split(',').map((k) => k.trim()).filter(Boolean);

  return res.json({
    success: true,
    gemini: {
      configured: geminiKeys.length > 0,
      keysCount: geminiKeys.length,
    },
    currency: {
      configured: currencyKeys.length > 0,
      keysCount: currencyKeys.length,
    },
  });
});

module.exports = router;
