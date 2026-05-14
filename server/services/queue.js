const EventEmitter = require('events');
const { fetchExchangeRates, convertCurrency } = require('./currency');
const { extractMetadataFromJobs } = require('./ai');
const { saveReport } = require('./storage');
const { HhParser } = require('../parsers/hh');
const { RabotaByParser } = require('../parsers/rabotaby');
const { HabrParser } = require('../parsers/habr');

const taskEmitter = new EventEmitter();
taskEmitter.setMaxListeners(50);

const taskQueue = [];
const MAX_QUEUE_SIZE = 50;

let isProcessing = false;
let currentTask = null;

function sanitizeQueryForId(query) {
  let sanitized = query
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'query';
}

function formatDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function enqueueTask(params) {
  if (taskQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error('Очередь сервера переполнена. Повторите попытку позже.');
  }

  const querySlug = sanitizeQueryForId(params.query);
  const dateTime = formatDateTime();
  const taskId = `report_${querySlug}_${dateTime}`;

  const task = {
    id: taskId,
    query: params.query,
    filters: {
      period: params.period || '7days',
      limit: params.limit || 50,
      sources: params.sources || { hh: true, rabotaby: true, habr: true },
      stopWords: params.stopWords || '',
      deepScrape: params.deepScrape || false,
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
    cancelFlag: {
      isStopped: false,
      abortController: null, // Создаётся при старте обработки
    },
  };

  taskQueue.push(task);
  console.log(`[Queue] 📥 Задача добавлена в очередь: ${taskId} (запрос: "${params.query}"). В очереди: ${taskQueue.length}`);

  emitUpdate(task);

  processNext();

  return task;
}

async function processNext() {
  if (isProcessing) return;

  const taskIndex = taskQueue.findIndex(t => t.status === 'pending');
  if (taskIndex === -1) return;

  isProcessing = true;
  const task = taskQueue[taskIndex];
  currentTask = task;

  task.cancelFlag.isStopped = false;
  task.cancelFlag.abortController = new AbortController();

  task.status = 'processing';
  task.startedAt = new Date().toISOString();

  console.log(`[Queue] ⚙️ Начинаю обработку: ${task.id}`);
  emitUpdate(task);

  try {
    console.log(`[Queue] 💱 Получение курсов валют...`);
    emitUpdate({ ...task, step: 'Получение курсов валют...' });
    const exchangeRates = await fetchExchangeRates();
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} удалена во время получения курсов валют. Прерываем.`);
      removeTaskFromQueue(task.id);
      return;
    }

    console.log(`[Queue] 🔍 Запуск парсеров для запроса: "${task.query}"...`);
    emitUpdate({ ...task, step: 'Парсинг вакансий...' });

    const parserResults = await runParsersWithRetry(task.query, task.filters, task.cancelFlag);

    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} удалена после парсинга. Данные выброшены.`);
      removeTaskFromQueue(task.id);
      return;
    }

    let allJobs = [];
    const errors = [];

    for (const result of parserResults) {
      if (result.success) {
        allJobs.push(...result.jobs);
      } else {
        errors.push(result.source);
      }
    }

    const normalize = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/[^\p{L}\d]/gu, '').trim();
    };
    allJobs = Array.from(new Map(allJobs.map(job => [`${normalize(job.company)}-${normalize(job.title)}-${normalize(job.city)}`, job])).values());

    console.log(`[Queue] 📊 Собрано вакансий: ${allJobs.length}. Ошибок источников: ${errors.length}`);

    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} удалена после дедупликации. Данные выброшены.`);
      removeTaskFromQueue(task.id);
      return;
    }

    emitUpdate({ ...task, step: 'AI-анализ вакансий...' });
    const enrichedJobs = await extractMetadataFromJobs(allJobs, (current, total) => {
      emitUpdate({ ...task, step: `AI-анализ вакансий: батч ${current} из ${total}...` });
    });

    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} удалена после AI-анализа. Данные выброшены.`);
      removeTaskFromQueue(task.id);
      return;
    }

    let sumSalaryRub = 0;
    let countSalary = 0;
    for (const job of enrichedJobs) {
      if (job.salary && (job.salary.min || job.salary.max)) {
        const avg = job.salary.min && job.salary.max ? (job.salary.min + job.salary.max) / 2 : job.salary.min || job.salary.max;
        const inRub = convertCurrency(avg, job.salary.currency, 'RUB', exchangeRates.rates);
        sumSalaryRub += inRub;
        countSalary++;
      }
    }
    const avgSalaryNormalized = countSalary > 0 ? Math.round(sumSalaryRub / countSalary) : null;

    const status = (errors.length > 0 && allJobs.length > 0) ? 'partial'
      : (allJobs.length === 0) ? 'failed'
        : 'completed';

    let failMessage = null;
    if (status === 'failed') {
      if (errors.length > 0) {
        failMessage = `Все выбранные источники (${errors.join(', ')}) вернули ошибку или заблокировали доступ.`;
      } else {
        failMessage = 'По вашему запросу не найдено ни одной вакансии.';
      }
    }

    const report = {
      id: task.id,
      query: task.query,
      filters: task.filters,
      status,
      createdAt: task.createdAt,
      completedAt: new Date().toISOString(),
      exchangeRates,
      stats: {
        totalFound: enrichedJobs.length,
        avgSalaryNormalized,
        sources: {
          hh: enrichedJobs.filter((j) => j.source === 'hh').length,
          rabotaby: enrichedJobs.filter((j) => j.source === 'rabotaby').length,
          habr: enrichedJobs.filter((j) => j.source === 'habr').length,
        },
      },
      errors,
      error: failMessage,
      jobs: enrichedJobs,
    };

    emitUpdate({ ...task, step: 'Сохранение отчёта...' });
    await saveReport(report);
    task.status = report.status;
    task.error = failMessage;
    console.log(`[Queue] ✅ Задача завершена: ${task.id} (статус: ${task.status})`);
    emitUpdate({ ...task, reportId: task.id, errors, error: failMessage });

    removeTaskFromQueue(task.id);
  } catch (error) {
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} прервана (abort). Данные выброшены.`);
      removeTaskFromQueue(task.id);
    } else {
      task.status = 'failed';
      console.error(`[Queue] ❌ Критическая ошибка при обработке ${task.id}:`, error.message);
      emitUpdate({ ...task, error: error.message });
      removeTaskFromQueue(task.id);
    }
  } finally {
    isProcessing = false;
    currentTask = null;
    processNext();
  }
}

async function runParsersWithRetry(query, filters, cancelFlag) {
  const allowedSources = filters.sources || { hh: true, rabotaby: true, habr: true };

  const parsers = [
    { name: 'hh', fn: (q, f, cf) => new HhParser().parse(q, f, cf) },
    { name: 'rabotaby', fn: (q, f, cf) => new RabotaByParser().parse(q, f, cf) },
    { name: 'habr', fn: (q, f, cf) => new HabrParser().parse(q, f, cf) },
  ].filter(p => allowedSources[p.name] === true);

  if (parsers.length === 0) {
    console.warn(`[Queue] ⚠️ Для запроса "${query}" не выбрано ни одного источника.`);
    return [];
  }

  const MAX_RETRIES = 3;

  const results = await Promise.all(
    parsers.map(async (parser) => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (cancelFlag.isStopped) {
          console.log(`[Queue] 🛑 ${parser.name}: задача остановлена, прерываем retry.`);
          return { source: parser.name, success: false, jobs: [] };
        }

        try {
          console.log(`[Queue] 🔄 ${parser.name}: попытка ${attempt}/${MAX_RETRIES}...`);
          const jobs = await parser.fn(query, filters, cancelFlag);
          console.log(`[Queue] ✅ ${parser.name}: получено ${jobs.length} вакансий.`);
          return { source: parser.name, success: true, jobs };
        } catch (error) {
          if (cancelFlag.isStopped || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
            console.log(`[Queue] 🛑 ${parser.name}: задача остановлена (abort).`);
            return { source: parser.name, success: false, jobs: [] };
          }

          console.warn(`[Queue] ⚠️ ${parser.name}: попытка ${attempt} не удалась — ${error.message}`);
          if (attempt < MAX_RETRIES) {
            const backoff = attempt * 3000;
            console.log(`[Queue] ⏳ ${parser.name}: ожидание ${backoff}мс перед повтором...`);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }

      console.error(`[Queue] ❌ ${parser.name}: все ${MAX_RETRIES} попытки провалились.`);
      return { source: parser.name, success: false, jobs: [] };
    })
  );

  return results;
}

// ────────────────────────────────────────────────
//  ФУНКЦИИ УПРАВЛЕНИЯ ЗАДАЧАМИ
// ────────────────────────────────────────────────

function abortTask(id) {
  const task = findTask(id);
  if (!task) return false;

  if (task.status === 'processing') {
    task.cancelFlag.isStopped = true;
    if (task.cancelFlag.abortController) {
      task.cancelFlag.abortController.abort();
    }
    console.log(`[Queue] 🛑 Задача ${id} отмечена для прерывания (удаление).`);
    return true;
  }

  return false;
}

function deleteTask(id) {
  const task = findTask(id);
  if (!task) return false;

  if (task.status === 'processing') {
    abortTask(id);
  }

  removeTaskFromQueue(id);
  console.log(`[Queue] ❌ Задача ${id} удалена из очереди.`);
  emitUpdate({ ...task, status: 'deleted' });
  return true;
}

function prioritizeTask(id) {
  const idx = taskQueue.findIndex(t => t.id === id);
  if (idx === -1 || idx === 0) return false;

  const task = taskQueue[idx];
  if (task.status !== 'pending') return false;

  taskQueue.splice(idx, 1);
  const firstNonProcessing = taskQueue.findIndex(t => t.status !== 'processing');
  const insertAt = firstNonProcessing === -1 ? taskQueue.length : firstNonProcessing;
  taskQueue.splice(insertAt, 0, task);

  console.log(`[Queue] ⬆️ Задача ${id} перемещена в начало очереди.`);
  emitUpdate(task);
  return true;
}

function updateTask(id, params) {
  const task = findTask(id);
  if (!task || task.status === 'processing') return false;

  if (params.query) task.query = params.query;
  if (params.limit) task.filters.limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 5), 200);
  if (params.period) task.filters.period = params.period;
  if (params.sources) task.filters.sources = params.sources;

  console.log(`[Queue] ✏️ Задача ${id} обновлена.`);
  emitUpdate(task);
  return true;
}

function getFullQueueState() {
  return {
    queue: taskQueue.map(t => ({
      id: t.id,
      query: t.query,
      filters: t.filters,
      status: t.status,
      createdAt: t.createdAt,
      startedAt: t.startedAt,
    })),
    currentTask: currentTask ? {
      id: currentTask.id,
      query: currentTask.query,
      filters: currentTask.filters,
      status: currentTask.status,
      createdAt: currentTask.createdAt,
      startedAt: currentTask.startedAt,
    } : null,
    isProcessing,
    queueLength: taskQueue.filter(t => t.status === 'pending').length,
  };
}

// ────────────────────────────────────────────────
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ────────────────────────────────────────────────

function findTask(id) {
  return taskQueue.find(t => t.id === id) || null;
}

function removeTaskFromQueue(id) {
  const idx = taskQueue.findIndex(t => t.id === id);
  if (idx !== -1) {
    taskQueue.splice(idx, 1);
  }
}

function emitUpdate(task) {
  taskEmitter.emit('taskUpdate', task);
}

function getQueueStatus() {
  return {
    isProcessing,
    queueLength: taskQueue.filter(t => t.status === 'pending').length,
  };
}

module.exports = {
  enqueueTask,
  getQueueStatus,
  getFullQueueState,
  deleteTask,
  prioritizeTask,
  updateTask,
  taskEmitter,
};
