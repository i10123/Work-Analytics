/**
 * @file queue.js — Менеджер очереди задач парсинга.
 * @description Обеспечивает последовательное выполнение задач сбора данных.
 *              Если парсинг уже идёт, новый запрос ставится в очередь (FIFO).
 *              Эмитит события для SSE-трансляции статуса клиентам.
 */

const EventEmitter = require('events');
const { fetchExchangeRates } = require('./currency');
const { extractSkillsFromJobs } = require('./ai');
const { saveReport } = require('./storage');
const hhParser = require('../parsers/hh');
const rabotabyParser = require('../parsers/rabotaby');
const habrParser = require('../parsers/habr');

/**
 * EventEmitter для SSE-трансляции.
 * Клиенты подписываются на событие 'taskUpdate'.
 * @type {EventEmitter}
 */
const taskEmitter = new EventEmitter();
taskEmitter.setMaxListeners(50);

/** Очередь задач (FIFO) */
const taskQueue = [];

/** Флаг: выполняется ли сейчас задача */
let isProcessing = false;

/**
 * Добавляет новую задачу парсинга в очередь.
 * Если очередь пуста и ничего не обрабатывается — задача запускается сразу.
 *
 * @param {Object} params — Параметры поиска.
 * @param {string} params.query — Ключевое слово для поиска вакансий.
 * @param {string} [params.period="7days"] — Период поиска.
 * @param {Object} [params.sources] — Включенные источники { hh, rabotaby, habr }.
 * @returns {Object} — Объект задачи с id и статусом.
 */
function enqueueTask(params) {
  const taskId = `report_${Date.now()}`;

  const task = {
    id: taskId,
    query: params.query,
    filters: {
      period: params.period || '7days',
      limit: params.limit || 50,
      sources: params.sources || { hh: true, rabotaby: true, habr: true },
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  taskQueue.push(task);
  console.log(`[Queue] 📥 Задача добавлена в очередь: ${taskId} (запрос: "${params.query}"). В очереди: ${taskQueue.length}`);

  /** Отправляем клиентам SSE-событие о новой задаче */
  emitUpdate(task);

  /** Пробуем начать обработку (если не занято) */
  processNext();

  return task;
}

/**
 * Берёт следующую задачу из очереди и выполняет её.
 * Если очередь пуста или уже идёт обработка — ничего не делает.
 * @returns {Promise<void>}
 */
async function processNext() {
  if (isProcessing || taskQueue.length === 0) return;

  isProcessing = true;
  const task = taskQueue.shift();
  task.status = 'processing';

  console.log(`[Queue] ⚙️ Начинаю обработку: ${task.id}`);
  emitUpdate(task);

  try {
    /** Шаг 1: Получаем курсы валют */
    console.log(`[Queue] 💱 Получение курсов валют...`);
    emitUpdate({ ...task, step: 'Получение курсов валют...' });
    const exchangeRates = await fetchExchangeRates();

    /** Шаг 2: Параллельный запуск парсеров (каждый с retry) */
    console.log(`[Queue] 🔍 Запуск парсеров для запроса: "${task.query}"...`);
    emitUpdate({ ...task, step: 'Парсинг вакансий...' });

    const parserResults = await runParsersWithRetry(task.query, task.filters);

    /** Шаг 3: Объединяем результаты всех парсеров */
    const allJobs = [];
    const errors = [];

    for (const result of parserResults) {
      if (result.success) {
        allJobs.push(...result.jobs);
      } else {
        errors.push(result.source);
      }
    }

    console.log(`[Queue] 📊 Собрано вакансий: ${allJobs.length}. Ошибок источников: ${errors.length}`);

    /** Шаг 4: Извлечение навыков через Gemini AI */
    emitUpdate({ ...task, step: 'Извлечение навыков (AI)...' });
    const enrichedJobs = await extractSkillsFromJobs(allJobs);

    /** Шаг 5: Формируем итоговый отчёт */
    const report = {
      id: task.id,
      query: task.query,
      filters: task.filters,
      status: errors.length > 0 && allJobs.length > 0 ? 'partial' : allJobs.length === 0 ? 'failed' : 'completed',
      createdAt: task.createdAt,
      completedAt: new Date().toISOString(),
      exchangeRates,
      stats: {
        totalFound: enrichedJobs.length,
        sources: {
          hh: enrichedJobs.filter((j) => j.source === 'hh').length,
          rabotaby: enrichedJobs.filter((j) => j.source === 'rabotaby').length,
          habr: enrichedJobs.filter((j) => j.source === 'habr').length,
        },
      },
      errors,
      jobs: enrichedJobs,
    };

    /** Шаг 6: Сохраняем JSON-файл */
    emitUpdate({ ...task, step: 'Сохранение отчёта...' });
    await saveReport(report);

    /** Готово! */
    task.status = report.status;
    console.log(`[Queue] ✅ Задача завершена: ${task.id} (статус: ${task.status})`);
    emitUpdate({ ...task, reportId: task.id, errors });
  } catch (error) {
    task.status = 'failed';
    console.error(`[Queue] ❌ Критическая ошибка при обработке ${task.id}:`, error.message);
    emitUpdate({ ...task, error: error.message });
  } finally {
    isProcessing = false;
    /** Пробуем взять следующую задачу из очереди */
    processNext();
  }
}

/**
 * Запускает все 3 парсера параллельно. Каждый парсер имеет до 3 попыток (retry).
 * Реализует паттерн "Graceful Degradation" — если один источник упал, остальные продолжают работу.
 *
 * @param {string} query — Поисковый запрос.
 * @param {Object} filters — Фильтры (period, limit).
 * @returns {Promise<Array<Object>>} — Массив результатов: [{ source, success, jobs }]
 */
async function runParsersWithRetry(query, filters) {
  const allowedSources = filters.sources || { hh: true, rabotaby: true, habr: true };

  const parsers = [
    { name: 'hh', fn: hhParser.parse },
    { name: 'rabotaby', fn: rabotabyParser.parse },
    { name: 'habr', fn: habrParser.parse },
  ].filter(p => allowedSources[p.name] !== false);

  if (parsers.length === 0) {
    console.warn(`[Queue] ⚠️ Для запроса "${query}" не выбрано ни одного источника.`);
    return [];
  }

  const MAX_RETRIES = 3;

  const results = await Promise.all(
    parsers.map(async (parser) => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[Queue] 🔄 ${parser.name}: попытка ${attempt}/${MAX_RETRIES}...`);
          const jobs = await parser.fn(query, filters);
          console.log(`[Queue] ✅ ${parser.name}: получено ${jobs.length} вакансий.`);
          return { source: parser.name, success: true, jobs };
        } catch (error) {
          console.warn(`[Queue] ⚠️ ${parser.name}: попытка ${attempt} не удалась — ${error.message}`);
          if (attempt < MAX_RETRIES) {
            /** Увеличиваем задержку при каждой повторной попытке (exponential backoff) */
            const backoff = attempt * 3000;
            console.log(`[Queue] ⏳ ${parser.name}: ожидание ${backoff}мс перед повтором...`);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }

      /** Все попытки исчерпаны */
      console.error(`[Queue] ❌ ${parser.name}: все ${MAX_RETRIES} попытки провалились.`);
      return { source: parser.name, success: false, jobs: [] };
    })
  );

  return results;
}

/**
 * Эмитит SSE-событие обновления статуса задачи.
 * @param {Object} task — Объект задачи (или его часть) для отправки клиентам.
 */
function emitUpdate(task) {
  taskEmitter.emit('taskUpdate', task);
}

/**
 * Возвращает текущее состояние очереди.
 * @returns {Object} — { isProcessing, queueLength }
 */
function getQueueStatus() {
  return {
    isProcessing,
    queueLength: taskQueue.length,
  };
}

module.exports = {
  enqueueTask,
  getQueueStatus,
  taskEmitter,
};
