/**
 * @file storage.js — Модуль хранения данных в JSON-файлах.
 * @description Отвечает за чтение, запись и листинг отчётов в директории data/reports/.
 *              Заменяет классическую СУБД файловой системой (требование курсовой).
 */

const fs = require('fs');
const path = require('path');

/** Абсолютный путь к директории с отчётами */
const REPORTS_DIR = path.join(__dirname, '..', '..', 'data', 'reports');
/** Абсолютный путь к файлу индекса */
const INDEX_FILE = path.join(REPORTS_DIR, 'index.json');

/** In-memory кэш для отчётов (чтобы не читать ФС каждый раз) */
let reportsCache = null;
let cacheInitPromise = null;

/** Promise-based queue для сериализации записей в index.json (защита от Race Condition) */
let saveIndexQueue = Promise.resolve();

/**
 * Создаёт директории data/ и data/reports/, если они ещё не существуют.
 * Вызывается один раз при старте сервера.
 * @returns {Promise<void>}
 */
async function ensureDataDirs() {
  try {
    await fs.promises.mkdir(REPORTS_DIR, { recursive: true });
    console.log(`[Storage] 📂 Директория отчётов готова: ${REPORTS_DIR}`);
  } catch (error) {
    console.error('[Storage] ❌ Не удалось создать директории:', error.message);
    throw error;
  }
}

/**
 * Сохраняет индексный файл.
 * Использует Promise-queue для предотвращения гонок и обеспечения
 * правильного ожидания (await) завершения записи вызывающим кодом.
 */
async function _saveIndex() {
  if (reportsCache === null) return;
  
  const currentWrite = saveIndexQueue.then(async () => {
    try {
      const jsonString = JSON.stringify(reportsCache, null, 2);
      await fs.promises.writeFile(`${INDEX_FILE}.tmp`, jsonString, 'utf-8');
      await fs.promises.rename(`${INDEX_FILE}.tmp`, INDEX_FILE);
    } catch (err) {
      console.error('[Storage] ❌ Ошибка сохранения index.json:', err.message);
    }
  });
  
  saveIndexQueue = currentWrite.catch(() => {});
  return currentWrite;
}

/**
 * Сохраняет объект отчёта в JSON-файл.
 * Имя файла формируется из поля report.id (например: report_1713360000.json).
 * @param {Object} report — Объект отчёта (должен содержать поле id).
 * @returns {Promise<string>} — Абсолютный путь к сохранённому файлу.
 */
async function saveReport(report) {
  if (!report || !/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(report.id)) {
    throw new Error('Invalid report ID format for saving');
  }
  const filename = `${report.id}.json`;
  const filepath = path.join(REPORTS_DIR, filename);

  try {
    const jsonString = JSON.stringify(report, null, 2);
    await fs.promises.writeFile(`${filepath}.tmp`, jsonString, 'utf-8');
    await fs.promises.rename(`${filepath}.tmp`, filepath);
    
    // Обновляем кэш только после успешного сохранения файла
    if (reportsCache !== null) {
      const existingIndex = reportsCache.findIndex(r => r.id === report.id);
      const cacheItem = {
        id: report.id,
        query: report.query,
        filters: report.filters,
        status: report.status,
        createdAt: report.createdAt,
        stats: report.stats,
        errors: report.errors || [],
      };
      
      if (existingIndex !== -1) {
        reportsCache[existingIndex] = cacheItem;
      } else {
        reportsCache.unshift(cacheItem);
      }
      await _saveIndex();
    }
    
    console.log(`[Storage] 💾 Отчёт сохранён: ${filename}`);
    return filepath;
  } catch (error) {
    console.error(`[Storage] ❌ Ошибка сохранения отчёта ${filename}:`, error.message);
    throw error;
  }
}

/**
 * Загружает отчёт по его идентификатору.
 * @param {string} reportId — ID отчёта (например: "report_1713360000").
 * @returns {Promise<Object|null>} — Распарсенный объект отчёта или null, если файл не найден.
 */
async function loadReport(reportId) {
  if (!/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(reportId)) {
    throw new Error('Invalid report ID format for loading');
  }
  const filepath = path.join(REPORTS_DIR, `${reportId}.json`);

  try {
    const raw = await fs.promises.readFile(filepath, 'utf-8');
    console.log(`[Storage] 📖 Отчёт загружен: ${reportId}`);
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[Storage] ⚠️ Отчёт не найден: ${reportId}`);
      return null;
    }
    console.error(`[Storage] ❌ Ошибка чтения отчёта ${reportId}:`, error.message);
    throw error;
  }
}

/**
 * Возвращает список всех сохранённых отчётов (метаданные без массива jobs).
 * Сортировка: от новых к старым (по дате создания).
 * @returns {Promise<Array<Object>>} — Массив кратких описаний отчётов.
 */
async function listReports() {
  if (reportsCache !== null) {
    return reportsCache;
  }

  if (!cacheInitPromise) {
    cacheInitPromise = (async () => {
      try {
        // Пробуем прочитать index.json
        try {
          const indexRaw = await fs.promises.readFile(INDEX_FILE, 'utf-8');
          reportsCache = JSON.parse(indexRaw);
          console.log(`[Storage] 📋 Кэш загружен из index.json (${reportsCache.length} отчётов).`);
          return reportsCache;
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.warn(`[Storage] ⚠️ Ошибка чтения index.json, пересобираем:`, err.message);
          } else {
            console.log(`[Storage] 📋 index.json не найден. Формируем индекс (холодный старт)...`);
          }
        }

        const files = await fs.promises.readdir(REPORTS_DIR);
        const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== 'index.json');

        console.log(`[Storage] 📋 Чтение отчётов для создания индекса: ${jsonFiles.length}`);

        const reports = [];
        for (const file of jsonFiles) {
          try {
            const raw = await fs.promises.readFile(path.join(REPORTS_DIR, file), 'utf-8');
            const report = JSON.parse(raw);
            reports.push({
              id: report.id,
              query: report.query,
              filters: report.filters,
              status: report.status,
              createdAt: report.createdAt,
              stats: report.stats,
              errors: report.errors || [],
            });
          } catch (err) {
            console.warn(`[Storage] ⚠️ Не удалось прочитать файл ${file}:`, err.message);
          }
        }

        reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        reportsCache = reports;
        await _saveIndex();
        console.log(`[Storage] 📋 Индекс сохранён в index.json.`);
        return reportsCache;
      } catch (error) {
        console.error('[Storage] ❌ Ошибка инициализации кэша отчётов:', error.message);
        cacheInitPromise = null; // Очищаем отравленный промис
        throw error;
      }
    })();
  }

  try {
    return await cacheInitPromise;
  } catch (error) {
    return [];
  }
}

/**
 * Удаляет один отчёт по его ID.
 * @param {string} reportId — ID отчёта.
 * @returns {Promise<boolean>} — true, если файл удалён, false, если файл не найден.
 */
async function deleteReport(reportId) {
  if (!/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(reportId)) {
    throw new Error('Invalid report ID format for deletion');
  }
  const filepath = path.join(REPORTS_DIR, `${reportId}.json`);

  try {
    await fs.promises.unlink(filepath);
    
    // Обновляем кэш только после успешного удаления файла
    if (reportsCache !== null) {
      reportsCache = reportsCache.filter(r => r.id !== reportId);
      await _saveIndex();
    }
    
    console.log(`[Storage] 🗑️ Отчёт удалён: ${reportId}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[Storage] ⚠️ Попытка удаления несуществующего отчёта: ${reportId}`);
      if (reportsCache !== null) {
        const len = reportsCache.length;
        reportsCache = reportsCache.filter(r => r.id !== reportId);
        if (reportsCache.length !== len) await _saveIndex();
      }
      return false;
    }
    console.error(`[Storage] ❌ Ошибка удаления отчёта ${reportId}:`, error.message);
    throw error;
  }
}

/**
 * Удаляет ВСЕ сохранённые отчёты.
 * @returns {Promise<number>} — Количество удалённых файлов.
 */
async function deleteAllReports() {
  try {
    const files = await fs.promises.readdir(REPORTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== 'index.json');

    // Параллельное удаление файлов (Promise.all вместо последовательного await)
    const results = await Promise.all(
      jsonFiles.map(file =>
        fs.promises.unlink(path.join(REPORTS_DIR, file))
          .then(() => true)
          .catch(err => {
            console.warn(`[Storage] ⚠️ Не удалось удалить ${file}:`, err.message);
            return false;
          })
      )
    );
    const count = results.filter(Boolean).length;

    // Очищаем кэш после успешного удаления файлов
    if (reportsCache !== null) {
      const deletedIds = new Set(jsonFiles.map(f => f.replace('.json', '')));
      reportsCache = reportsCache.filter(r => !deletedIds.has(r.id));
      await _saveIndex();
    }

    console.log(`[Storage] 🗑️ Очистка завершена. Удалено файлов: ${count}`);
    return count;
  } catch (error) {
    console.error('[Storage] ❌ Ошибка при массовом удалении:', error.message);
    throw error;
  }
}

module.exports = {
  ensureDataDirs,
  saveReport,
  loadReport,
  listReports,
  deleteReport,
  deleteAllReports,
  REPORTS_DIR,
};
