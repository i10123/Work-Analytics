const express = require('express');
const router = express.Router();
const { enqueueTask, getQueueStatus, getFullQueueState, deleteTask, prioritizeTask, updateTask, taskEmitter, gracefulStop } = require('../services/queue');
const { listReports, loadReport, deleteReport, deleteAllReports, saveReport } = require('../services/storage');
const { getSettings, saveSettings: saveServerSettings } = require('../services/settings');
const { generateCandidateProfile } = require('../services/ai');
const rateLimit = require('express-rate-limit');

const parseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    error: 'Слишком много запросов на парсинг. Пожалуйста, подождите 15 минут.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/parse', parseLimiter, (req, res) => {
  const { query, period, limit, sources, stopWords, deepScrape, clientId } = req.body;

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
      deepScrape,
      clientId
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
  const { selectedSkills } = req.body || {};

  if (!/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Неверный формат ID отчёта.' });
  }

  try {
    const report = await loadReport(id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Отчёт не найден.' });
    }

    const hasSameSkills = () => {
      if (!report.aiSummary) return false;
      const cachedSkills = report.aiSummarySkills || [];
      const newSkills = selectedSkills || [];
      if (cachedSkills.length !== newSkills.length) return false;
      const s1 = [...cachedSkills].map(s => s.toLowerCase()).sort();
      const s2 = [...newSkills].map(s => s.toLowerCase()).sort();
      return s1.every((val, index) => val === s2[index]);
    };
    if (report.aiSummary && hasSameSkills()) {
      return res.json({ success: true, summary: report.aiSummary });
    }

    const { isProcessing } = getQueueStatus();
    if (isProcessing) {
      console.warn(`[API] ⚠️ Генерация сводки отклонена: ИИ занят парсингом.`);
      return res.status(409).json({
        success: false,
        error: 'Данная функция пока недоступна, пока идет работа с ИИ (парсинг новых вакансий).'
      });
    }

    console.log(`[API] ✨ Генерация AI сводки для отчёта: ${id} (выбранные навыки: ${selectedSkills ? selectedSkills.join(', ') : 'нет'})`);
    const summary = await generateCandidateProfile(report, selectedSkills);

    report.aiSummary = summary;
    report.aiSummarySkills = selectedSkills || [];
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
    const taskDeleted = deleteTask(id);
    const deleted = await deleteReport(id);

    if (!deleted && !taskDeleted) {
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

router.post('/queue/:id/stop', (req, res) => {
  const { id } = req.params;
  const ok = gracefulStop(id);
  if (!ok) return res.status(404).json({ success: false, error: 'Задача не найдена или не выполняется.' });
  return res.json({ success: true, message: 'Сбор данных будет завершен досрочно.' });
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

  const maskKey = (key) => {
    if (!key) return null;
    return key.slice(0, 4) + '...';
  };

  return res.json({
    success: true,
    currency: {
      configured: currencyKeys.length > 0,
      keys: currencyKeys.map(maskKey),
    }
  });
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({ success: true, settings });
  } catch (error) {
    console.error('[API] ❌ Ошибка получения настроек:', error.message);
    return res.status(500).json({ success: false, error: 'Ошибка получения настроек.' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const settings = req.body;
    const updated = await saveServerSettings(settings);
    return res.json({ success: true, settings: updated });
  } catch (error) {
    console.error('[API] ❌ Ошибка сохранения настроек:', error.message);
    return res.status(500).json({ success: false, error: 'Ошибка сохранения настроек.' });
  }
});

router.get('/events', (req, res) => {
  const { clientId } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 30000);

  const onTaskUpdate = (task) => {
    if (!task.clientId || task.clientId === clientId) {
      res.write(`event: taskUpdate\ndata: ${JSON.stringify(task)}\n\n`);
    }
  };

  const onQueueStatus = (status) => {
    res.write(`event: queueStatus\ndata: ${JSON.stringify(status)}\n\n`);
  };

  taskEmitter.on('taskUpdate', onTaskUpdate);
  taskEmitter.on('queueStatus', onQueueStatus);

  res.write(`event: queueStatus\ndata: ${JSON.stringify(getQueueStatus())}\n\n`);

  req.on('close', () => {
    clearInterval(heartbeat);
    taskEmitter.off('taskUpdate', onTaskUpdate);
    taskEmitter.off('queueStatus', onQueueStatus);
  });
});

module.exports = router;
