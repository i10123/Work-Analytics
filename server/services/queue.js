const EventEmitter = require('events');
const { runPipeline } = require('./pipeline');
const { transliterate } = require('./dedup');

const taskEmitter = new EventEmitter();
taskEmitter.setMaxListeners(50);

const taskQueue = [];
const MAX_QUEUE_SIZE = 50;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_TASKS, 10) || 1;

let activeTasksCount = 0;
let currentTask = null;

function sanitizeQueryForId(query) {
  let sanitized = transliterate(query)
    .replace(/[^a-zA-Z0-9_]+/g, '_')
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
    clientId: params.clientId || null,
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
      abortController: null, 
    },
  };

  taskQueue.push(task);
  console.log(`[Queue] 📥 Задача добавлена в очередь: ${taskId} (запрос: "${params.query}"). В очереди: ${taskQueue.length}`);

  emitUpdate(task);

  processNext();

  return task;
}

function processNext() {
  if (activeTasksCount >= MAX_CONCURRENT) return;

  const taskIndex = taskQueue.findIndex(t => t.status === 'pending');
  if (taskIndex === -1) return;

  activeTasksCount++;
  const task = taskQueue[taskIndex];
  currentTask = task;

  _processTask(task);

  processNext();
}

async function _processTask(task) {
  task.cancelFlag.isStopped = false;
  task.cancelFlag.abortController = new AbortController();

  task.status = 'processing';
  task.startedAt = new Date().toISOString();

  console.log(`[Queue] ⚙️ Начинаю обработку: ${task.id}`);
  emitUpdate(task);

  let taskTimeout;

  try {
    await Promise.race([
      (async () => {
        await runPipeline(task, emitUpdate);
        removeTaskFromQueue(task.id);
      })(),
      new Promise((_, reject) => {
        taskTimeout = setTimeout(() => {
          console.error(`[Queue] ⏱️ Задача ${task.id} превысила лимит времени. Принудительное прерывание.`);
          task.cancelFlag.isStopped = true;
          if (task.cancelFlag.abortController) {
            try {
              task.cancelFlag.abortController.abort();
            } catch (e) {
              console.error(`[Queue] ⚠️ Ошибка при вызове abort() по таймауту:`, e);
            }
          }
          reject(new Error('Превышен лимит времени на обработку задачи.'));
        }, 15 * 60 * 1000); 
      })
    ]);

    if (task.cancelFlag.isStopped) {
      task.status = 'failed';
      task.error = 'Сбор данных остановлен пользователем.';
      console.log(`[Queue] 🛑 Задача ${task.id} досрочно завершена пользователем.`);
      emitUpdate(task);
    }
  } catch (error) {
    task.status = 'failed';
    task.error = error.message || 'Ошибка сбора данных.';
    
    if (task.cancelFlag.isStopped) {
      console.log(`[Queue] 🛑 Задача ${task.id} прервана (abort/timeout). Данные выброшены.`);
    } else {
      console.error(`[Queue] ❌ Критическая ошибка при обработке ${task.id}:`, error);
    }
    
    emitUpdate(task);
    removeTaskFromQueue(task.id);
  } finally {
    if (taskTimeout) clearTimeout(taskTimeout);
    activeTasksCount--;
    if (activeTasksCount === 0) currentTask = null;
    processNext();
  }
}

function abortTask(id) {
  const task = findTask(id);
  if (!task) return false;

  if (task.status === 'processing') {
    task.cancelFlag.isStopped = true;
    if (task.cancelFlag.abortController) {
      try {
        task.cancelFlag.abortController.abort();
      } catch (e) {
        console.error(`[Queue] ⚠️ Ошибка при вызове abort() для задачи ${id}:`, e);
      }
    }
    console.log(`[Queue] 🛑 Задача ${id} отмечена для прерывания (удаление).`);
    return true;
  }

  return false;
}

function gracefulStop(id) {
  const task = findTask(id);
  if (!task) return false;
  
  if (task.status === 'processing') {
    task.cancelFlag.isStopped = true;
    if (task.cancelFlag.abortController) {
      try {
        task.cancelFlag.abortController.abort();
      } catch (e) {
        console.error(`[Queue] ⚠️ Ошибка при вызове abort() для задачи ${id}:`, e);
      }
    }
    console.log(`[Queue] 🛑 Задача ${id} отмечена для досрочного завершения (graceful stop).`);
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
    isProcessing: activeTasksCount > 0,
    queueLength: taskQueue.filter(t => t.status === 'pending').length,
  };
}

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
  taskEmitter.emit('queueStatus', getQueueStatus());
}

function getQueueStatus() {
  return {
    isProcessing: activeTasksCount > 0,
    queueLength: taskQueue.filter(t => t.status === 'pending').length,
  };
}

module.exports = {
  enqueueTask,
  getQueueStatus,
  getFullQueueState,
  deleteTask,
  gracefulStop,
  prioritizeTask,
  updateTask,
  taskEmitter,
};
