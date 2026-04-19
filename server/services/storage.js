/**
 * @file storage.js — Модуль хранения данных в JSON-файлах.
 * @description Отвечает за чтение, запись и листинг отчётов в директории data/reports/.
 *              Заменяет классическую СУБД файловой системой (требование курсовой).
 */

const fs = require('fs');
const path = require('path');

/** Абсолютный путь к директории с отчётами */
const REPORTS_DIR = path.join(__dirname, '..', '..', 'data', 'reports');

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
 * Сохраняет объект отчёта в JSON-файл.
 * Имя файла формируется из поля report.id (например: report_1713360000.json).
 * @param {Object} report — Объект отчёта (должен содержать поле id).
 * @returns {Promise<string>} — Абсолютный путь к сохранённому файлу.
 */
async function saveReport(report) {
  const filename = `${report.id}.json`;
  const filepath = path.join(REPORTS_DIR, filename);

  try {
    const jsonString = JSON.stringify(report, null, 2);
    await fs.promises.writeFile(filepath, jsonString, 'utf-8');
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
  try {
    const files = await fs.promises.readdir(REPORTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    console.log(`[Storage] 📋 Найдено отчётов: ${jsonFiles.length}`);

    /** Читаем каждый файл и извлекаем метаданные (без массива jobs — для экономии памяти) */
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

    /** Сортировка: новые отчёты сверху */
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return reports;
  } catch (error) {
    console.error('[Storage] ❌ Ошибка получения списка отчётов:', error.message);
    return [];
  }
}

/**
 * Удаляет один отчёт по его ID.
 * @param {string} reportId — ID отчёта.
 * @returns {Promise<boolean>} — true, если файл удалён, false, если файл не найден.
 */
async function deleteReport(reportId) {
  const filepath = path.join(REPORTS_DIR, `${reportId}.json`);

  try {
    await fs.promises.unlink(filepath);
    console.log(`[Storage] 🗑️ Отчёт удалён: ${reportId}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[Storage] ⚠️ Попытка удаления несуществующего отчёта: ${reportId}`);
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
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    let count = 0;
    for (const file of jsonFiles) {
      await fs.promises.unlink(path.join(REPORTS_DIR, file));
      count++;
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
