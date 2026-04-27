/**
 * @file queue.js — Менеджер очереди задач парсинга.
 * @description Обеспечивает последовательное выполнение задач сбора данных.
 *              Если парсинг уже идёт, новый запрос ставится в очередь (FIFO).
 *              Эмитит события для SSE-трансляции статуса клиентам.
 *              Поддерживает остановку, перезапуск, удаление, приоритезацию задач.
 */

const EventEmitter = require('events');
const { fetchExchangeRates, convertCurrency } = require('./currency');
const { extractMetadataFromJobs } = require('./ai');
const { saveReport } = require('./storage');
const { HhParser } = require('../parsers/hh');
const { RabotaByParser } = require('../parsers/rabotaby');
const { HabrParser } = require('../parsers/habr');

/**
 * EventEmitter для SSE-трансляции.
 * Клиенты подписываются на событие 'taskUpdate'.
 * @type {EventEmitter}
 */
const taskEmitter = new EventEmitter();
taskEmitter.setMaxListeners(50);

/** Очередь задач (FIFO) */
const taskQueue = [];

/** Максимальное количество задач в очереди (защита от OOM) */
const MAX_QUEUE_SIZE = 50;

/** Флаг: выполняется ли сейчас задача */
let isProcessing = false;

/** Текущая выполняемая задача (ссылка) */
let currentTask = null;

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
  if (taskQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error('Очередь сервера переполнена. Повторите попытку позже.');
  }

  const taskId = `report_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

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
  if (isProcessing) return;

  // Ищем первую pending-задачу в очереди
  const taskIndex = taskQueue.findIndex(t => t.status === 'pending');
  if (taskIndex === -1) return;

  isProcessing = true;
  const task = taskQueue[taskIndex];
  currentTask = task;

  // Создаём AbortController для этой задачи
  task.cancelFlag.isStopped = false;
  task.cancelFlag.abortController = new AbortController();

  task.status = 'processing';

  console.log(`[Queue] ⚙️ Начинаю обработку: ${task.id}`);
  emitUpdate(task);

  try {
    /** Шаг 1: Получаем курсы валют */
    console.log(`[Queue] 💱 Получение курсов валют...`);
    emitUpdate({ ...task, step: 'Получение курсов валют...' });
    const exchangeRates = await fetchExchangeRates();

    // Проверка остановки после каждого шага
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} остановлена после получения курсов валют.`);
      task.status = 'stopped';
      emitUpdate(task);
      return;
    }

    /** Шаг 2: Параллельный запуск парсеров (каждый с retry) */
    console.log(`[Queue] 🔍 Запуск парсеров для запроса: "${task.query}"...`);
    emitUpdate({ ...task, step: 'Парсинг вакансий...' });

    const parserResults = await runParsersWithRetry(task.query, task.filters, task.cancelFlag);

    // === ЗАЩИТА: проверка isStopped СРАЗУ после возврата из парсеров ===
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} остановлена после парсинга. Данные выброшены.`);
      task.status = 'stopped';
      emitUpdate(task);
      return; // НЕ вызываем AI и saveReport
    }

    /** Шаг 3: Объединяем результаты всех парсеров */
    let allJobs = [];
    const errors = [];

    for (const result of parserResults) {
      if (result.success) {
        allJobs.push(...result.jobs);
      } else {
        errors.push(result.source);
      }
    }

    // Очистка дубликатов (Дедупликация)
    const normalize = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/[^\p{L}\d]/gu, '').trim();
    };
    allJobs = Array.from(new Map(allJobs.map(job => [`${normalize(job.company)}-${normalize(job.title)}-${normalize(job.city)}`, job])).values());

    console.log(`[Queue] 📊 Собрано вакансий: ${allJobs.length}. Ошибок источников: ${errors.length}`);

    // Ещё одна проверка остановки
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} остановлена после дедупликации. Данные выброшены.`);
      task.status = 'stopped';
      emitUpdate(task);
      return;
    }

    /** Шаг 4: Извлечение метаданных через AI (навыки, опыт, формат, категория и др.) */
    emitUpdate({ ...task, step: 'AI-анализ вакансий...' });
    const enrichedJobs = await extractMetadataFromJobs(allJobs);

    // Проверка остановки после AI
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} остановлена после AI-анализа. Данные выброшены.`);
      task.status = 'stopped';
      emitUpdate(task);
      return;
    }

    /** Шаг 5: Формируем итоговый отчёт */
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

    /** Шаг 6: Сохраняем JSON-файл */
    emitUpdate({ ...task, step: 'Сохранение отчёта...' });
    await saveReport(report);

    /** Готово! */
    task.status = report.status;
    task.error = failMessage;
    console.log(`[Queue] ✅ Задача завершена: ${task.id} (статус: ${task.status})`);
    emitUpdate({ ...task, reportId: task.id, errors, error: failMessage });

    // Удаляем завершённую задачу из очереди
    removeTaskFromQueue(task.id);
  } catch (error) {
    // Если задача была остановлена и axios выбросил AbortError — не считаем это критической ошибкой
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} остановлена (abort). Данные выброшены.`);
      task.status = 'stopped';
      emitUpdate(task);
    } else {
      task.status = 'failed';
      console.error(`[Queue] ❌ Критическая ошибка при обработке ${task.id}:`, error.message);
      emitUpdate({ ...task, error: error.message });
      // Удаляем упавшую задачу из очереди
      removeTaskFromQueue(task.id);
    }
  } finally {
    isProcessing = false;
    currentTask = null;
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
 * @param {Object} cancelFlag — Флаг отмены { isStopped, abortController }.
 * @returns {Promise<Array<Object>>} — Массив результатов: [{ source, success, jobs }]
 */
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
        // Проверка остановки перед каждой попыткой
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
          // Если задача остановлена — не повторяем
          if (cancelFlag.isStopped || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
            console.log(`[Queue] 🛑 ${parser.name}: задача остановлена (abort).`);
            return { source: parser.name, success: false, jobs: [] };
          }

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

// ────────────────────────────────────────────────
//  ФУНКЦИИ УПРАВЛЕНИЯ ЗАДАЧАМИ
// ────────────────────────────────────────────────

/**
 * Останавливает активную задачу. Ставит isStopped = true и абортит сетевые запросы.
 * @param {string} id — ID задачи.
 * @returns {boolean} — Успешно ли.
 */
function stopTask(id) {
  const task = findTask(id);
  if (!task) return false;

  if (task.status === 'processing') {
    task.cancelFlag.isStopped = true;
    if (task.cancelFlag.abortController) {
      task.cancelFlag.abortController.abort();
    }
    // Статус будет изменён в processNext() при проверке флага
    console.log(`[Queue] 🛑 Задача ${id} отмечена для остановки.`);
    return true;
  }

  // Если pending — просто меняем статус
  if (task.status === 'pending') {
    task.status = 'stopped';
    emitUpdate(task);
    return true;
  }

  return false;
}

/**
 * Перезапускает остановленную задачу (ставит pending).
 * @param {string} id — ID задачи.
 * @returns {boolean}
 */
function restartTask(id) {
  const task = findTask(id);
  if (!task || task.status !== 'stopped') return false;

  task.status = 'pending';
  task.cancelFlag = {
    isStopped: false,
    abortController: null,
  };
  console.log(`[Queue] ▶️ Задача ${id} перезапущена (pending).`);
  emitUpdate(task);

  // Пробуем начать обработку
  processNext();
  return true;
}

/**
 * Удаляет задачу из очереди. Если активна — сначала останавливает.
 * @param {string} id — ID задачи.
 * @returns {boolean}
 */
function deleteTask(id) {
  const task = findTask(id);
  if (!task) return false;

  // Если задача в процессе — останавливаем
  if (task.status === 'processing') {
    stopTask(id);
  }

  removeTaskFromQueue(id);
  console.log(`[Queue] ❌ Задача ${id} удалена из очереди.`);
  emitUpdate({ ...task, status: 'deleted' });
  return true;
}

/**
 * Перемещает задачу в начало очереди (приоритет).
 * @param {string} id — ID задачи.
 * @returns {boolean}
 */
function prioritizeTask(id) {
  const idx = taskQueue.findIndex(t => t.id === id);
  if (idx === -1 || idx === 0) return false;

  const task = taskQueue[idx];
  if (task.status !== 'pending') return false; // Можно приоритизировать только pending

  taskQueue.splice(idx, 1);
  // Вставляем после processing задачи (если есть) или в начало
  const firstNonProcessing = taskQueue.findIndex(t => t.status !== 'processing');
  const insertAt = firstNonProcessing === -1 ? taskQueue.length : firstNonProcessing;
  taskQueue.splice(insertAt, 0, task);

  console.log(`[Queue] ⬆️ Задача ${id} перемещена в начало очереди.`);
  emitUpdate(task);
  return true;
}

/**
 * Обновляет параметры задачи (запрос, лимит и т.д.). Только если не processing.
 * @param {string} id — ID задачи.
 * @param {Object} params — Новые параметры { query?, limit?, period?, sources? }.
 * @returns {boolean}
 */
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

/**
 * Возвращает полное состояние очереди для фронтенда.
 * @returns {Object} — { queue: [...], currentTask: {...} | null }
 */
function getFullQueueState() {
  return {
    queue: taskQueue.map(t => ({
      id: t.id,
      query: t.query,
      filters: t.filters,
      status: t.status,
      createdAt: t.createdAt,
    })),
    currentTask: currentTask ? {
      id: currentTask.id,
      query: currentTask.query,
      filters: currentTask.filters,
      status: currentTask.status,
      createdAt: currentTask.createdAt,
    } : null,
    isProcessing,
    queueLength: taskQueue.filter(t => t.status === 'pending').length,
  };
}

// ────────────────────────────────────────────────
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ────────────────────────────────────────────────

/**
 * Находит задачу по ID в очереди.
 * @param {string} id
 * @returns {Object|null}
 */
function findTask(id) {
  return taskQueue.find(t => t.id === id) || null;
}

/**
 * Удаляет задачу из массива очереди по ID.
 * @param {string} id
 */
function removeTaskFromQueue(id) {
  const idx = taskQueue.findIndex(t => t.id === id);
  if (idx !== -1) {
    taskQueue.splice(idx, 1);
  }
}

/**
 * Эмитит SSE-событие обновления статуса задачи.
 * @param {Object} task — Объект задачи (или его часть) для отправки клиентам.
 */
function emitUpdate(task) {
  taskEmitter.emit('taskUpdate', task);
}

/**
 * Возвращает текущее состояние очереди (совместимость со старым API).
 * @returns {Object} — { isProcessing, queueLength }
 */
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
  stopTask,
  restartTask,
  deleteTask,
  prioritizeTask,
  updateTask,
  taskEmitter,
};
