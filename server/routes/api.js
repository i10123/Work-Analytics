const express = require('express');
const router = express.Router();
const { enqueueTask, getQueueStatus, getFullQueueState, deleteTask, prioritizeTask, updateTask, taskEmitter } = require('../services/queue');
const { listReports, loadReport, deleteReport, deleteAllReports, saveReport } = require('../services/storage');
const { generateCandidateProfile } = require('../services/ai');

router.post('/parse', (req, res) => {
  const { query, period, limit, sources, stopWords, deepScrape } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    console.warn('[API] ⚠️ Попытка запуска без ключевого слова.');
    return res.status(400).json({
      success: false,
      error: 'Параметр "query" обязателен. Укажите ключевое слово для поиска.',
    });
  }

  if (query.trim().length > 200) {
    console.warn('[API] ⚠️ Слишком длинный запрос:', query.trim().length, 'символов');
    return res.status(400).json({
      success: false,
      error: 'Запрос слишком длинный. Максимум 200 символов.',
    });
  }

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 5), 200);

  console.log(`[API] 🚀 Новый запрос на парсинг: "${query.trim()}", период: ${period || '7days'}, лимит: ${parsedLimit}, источники:`, sources);

  let task;
  try {
    task = enqueueTask({
      query: query.trim(),
      period: period || '7days',
      limit: parsedLimit,
      sources,
      stopWords,
      deepScrape
    });
  } catch (err) {
    console.warn(`[API] ⚠️ Очередь переполнена: ${err.message}`);
    return res.status(429).json({
      success: false,
      error: err.message,
    });
  }

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

router.get('/reports/:id', async (req, res) => {
  const { id } = req.params;

  if (!/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Неверный формат ID отчёта.' });
  }

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

router.post('/reports/:id/summary', async (req, res) => {
  const { id } = req.params;

  if (!/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Неверный формат ID отчёта.' });
  }

  try {
    const report = await loadReport(id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Отчёт не найден.' });
    }

    if (report.aiSummary) {
      return res.json({ success: true, summary: report.aiSummary });
    }

    console.log(`[API] ✨ Генерация AI сводки для отчёта: ${id}`);
    const summary = await generateCandidateProfile(report);

    report.aiSummary = summary;
    await saveReport(report);

    return res.json({ success: true, summary });
  } catch (error) {
    console.error(`[API] ❌ Ошибка генерации сводки для ${id}:`, error.message);
    return res.status(500).json({ success: false, error: 'Ошибка генерации сводки.' });
  }
});

router.delete('/reports/:id', async (req, res) => {
  const { id } = req.params;

  if (!/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Неверный формат ID отчёта.' });
  }

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

router.delete('/reports', async (req, res) => {
  try {
    const count = await deleteAllReports();
    return res.json({ success: true, count, message: `Удалено отчётов: ${count}` });
  } catch (error) {
    console.error('[API] ❌ Ошибка массового удаления:', error.message);
    return res.status(500).json({ success: false, error: 'Ошибка массового удаления отчётов.' });
  }
});

router.get('/queue', (req, res) => {
  const state = getFullQueueState();
  return res.json({ success: true, ...state });
});

router.post('/queue/:id/delete', (req, res) => {
  const { id } = req.params;
  const ok = deleteTask(id);
  if (!ok) return res.status(404).json({ success: false, error: 'Задача не найдена.' });
  return res.json({ success: true, message: 'Задача удалена.' });
});

router.post('/queue/:id/priority', (req, res) => {
  const { id } = req.params;
  const ok = prioritizeTask(id);
  if (!ok) return res.status(404).json({ success: false, error: 'Задача не найдена или не может быть приоритизирована.' });
  return res.json({ success: true, message: 'Задача перемещена в начало очереди.' });
});

router.put('/queue/:id', (req, res) => {
  const { id } = req.params;
  const { query, limit, period, sources } = req.body;
  const ok = updateTask(id, { query, limit, period, sources });
  if (!ok) return res.status(404).json({ success: false, error: 'Задача не найдена или выполняется.' });
  return res.json({ success: true, message: 'Параметры задачи обновлены.' });
});

router.get('/status', (req, res) => {
  const currencyKeysStr = process.env.EXCHANGE_RATE_API_KEYS || '';
  const currencyKeys = currencyKeysStr.split(',').map((k) => k.trim()).filter(Boolean);
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';

  const maskKey = (key) => {
    if (!key) return null;
    return key.slice(0, 4) + '...';
  };

  return res.json({
    success: true,
    currency: {
      configured: currencyKeys.length > 0,
      keys: currencyKeys.map(maskKey),
    },
    openrouter: {
      configured: !!openrouterKey,
      key: maskKey(openrouterKey),
    }
  });
});

module.exports = router;
