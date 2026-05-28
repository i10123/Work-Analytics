const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REPORTS_DIR = path.join(__dirname, '..', '..', 'data', 'reports');
const INDEX_FILE = path.join(REPORTS_DIR, 'index.jsonl');
const LEGACY_INDEX_FILE = path.join(REPORTS_DIR, 'index.json');

function getSecureFilepath(reportId, action) {
  if (!reportId || typeof reportId !== 'string' || !/^report_[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(reportId)) {
    throw new Error(`Неверный формат ID отчёта для действия: ${action}`);
  }
  const filename = `${reportId}.json`;
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename) {
    throw new Error(`Обнаружена попытка выхода за пределы директории в имени файла для действия: ${action}`);
  }
  const filepath = path.resolve(REPORTS_DIR, safeFilename);
  const normalizedReportsDir = path.resolve(REPORTS_DIR);
  if (!filepath.startsWith(normalizedReportsDir + path.sep)) {
    throw new Error(`Обнаружена попытка выхода за пределы директории в разрешенном пути для действия: ${action}`);
  }
  return filepath;
}

let reportsCache = null;
let cacheInitPromise = null;
let lastInitErrorTime = 0;
const INIT_ERROR_COOLDOWN_MS = 10000;

async function ensureDataDirs() {
  try {
    await fs.promises.mkdir(REPORTS_DIR, { recursive: true });
  } catch (error) {
    console.error('[Storage] ❌ Не удалось создать директории:', error.message);
    throw error;
  }
}

async function _appendToIndex(cacheItem) {
  if (!cacheItem) return;
  try {
    const line = JSON.stringify(cacheItem) + '\n';
    await fs.promises.appendFile(INDEX_FILE, line, 'utf-8');
  } catch (err) {
    console.error('[Storage] ❌ Ошибка добавления в index.jsonl:', err.message);
  }
}

async function _compactIndex() {
  if (reportsCache === null) return;
  try {
    const tempFile = `${INDEX_FILE}.tmp`;
    const content = reportsCache.map(r => JSON.stringify(r)).join('\n') + '\n';
    await fs.promises.writeFile(tempFile, content, 'utf-8');
    await fs.promises.rename(tempFile, INDEX_FILE);
  } catch (err) {
    console.error('[Storage] ❌ Ошибка компактизации index.jsonl:', err.message);
  }
}

async function listReports() {
  if (reportsCache !== null) return reportsCache;

  if (!cacheInitPromise) {
    if (Date.now() - lastInitErrorTime < INIT_ERROR_COOLDOWN_MS) {
      console.warn('[Storage] ⚠️ Активен кулдаун для listReports(), возвращается пустой список.');
      return [];
    }

    cacheInitPromise = (async () => {
      let reportsMap = new Map();
      let totalLines = 0;

      try {
        const legacyIndex = await fs.promises.readFile(LEGACY_INDEX_FILE, 'utf-8');
        const legacyData = JSON.parse(legacyIndex);
        for (const item of legacyData) {
          reportsMap.set(item.id, item);
        }
        await fs.promises.rename(LEGACY_INDEX_FILE, `${LEGACY_INDEX_FILE}.bak`);
        console.log('[Storage] 📋 Миграция index.json -> index.jsonl завершена.');
      } catch (err) {
      }

      try {
        const fileStream = fs.createReadStream(INDEX_FILE);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        for await (const line of rl) {
          if (!line.trim()) continue;
          totalLines++;
          try {
            const item = JSON.parse(line);
            if (item._deleted) {
              reportsMap.delete(item.id);
            } else {
              reportsMap.set(item.id, item);
            }
          } catch (e) {
            console.warn(`[Storage] ⚠️ Ошибка парсинга строки в index.jsonl:`, e.message);
          }
        }
        console.log(`[Storage] 📋 Индекс загружен из index.jsonl (${reportsMap.size} отчётов).`);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('[Storage] ❌ Ошибка чтения index.jsonl:', err.message);
          throw err;
        } else {
          console.log(`[Storage] 📋 index.jsonl не найден. Начинаем с чистого листа.`);
        }
      }

      reportsCache = Array.from(reportsMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (totalLines > reportsCache.length * 1.5) {
        console.log(`[Storage] 🧹 Компактизация index.jsonl (${totalLines} строк -> ${reportsCache.length} отчётов)...`);
        await _compactIndex();
      }

      return reportsCache;
    })();
  }

  try {
    return await cacheInitPromise;
  } catch (e) {
    lastInitErrorTime = Date.now();
    cacheInitPromise = null;
    return [];
  }
}

async function saveReport(report) {
  if (!report) throw new Error('Некорректный объект отчёта');
  const filepath = getSecureFilepath(report.id, 'saving');
  const filename = path.basename(filepath);

  try {
    const jsonString = JSON.stringify(report, null, 2);
    await fs.promises.writeFile(`${filepath}.tmp`, jsonString, 'utf-8');
    await fs.promises.rename(`${filepath}.tmp`, filepath);

    const cacheItem = {
      id: report.id,
      query: report.query,
      filters: report.filters,
      status: report.status,
      createdAt: report.createdAt,
      stats: report.stats,
      errors: report.errors || [],
    };

    if (reportsCache !== null) {
      const existingIndex = reportsCache.findIndex(r => r.id === report.id);
      if (existingIndex !== -1) {
        reportsCache[existingIndex] = cacheItem;
      } else {
        reportsCache.unshift(cacheItem);
        reportsCache.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    }

    await _appendToIndex(cacheItem);
    console.log(`[Storage] 💾 Отчёт сохранён: ${filename}`);
    return filepath;
  } catch (error) {
    console.error(`[Storage] ❌ Ошибка сохранения отчёта ${filename}:`, error.message);
    throw error;
  }
}

async function loadReport(reportId) {
  const filepath = getSecureFilepath(reportId, 'loading');
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

async function deleteReport(reportId) {
  const filepath = getSecureFilepath(reportId, 'deletion');
  try {
    await fs.promises.unlink(filepath);

    if (reportsCache !== null) {
      reportsCache = reportsCache.filter(r => r.id !== reportId);
    }

    await _appendToIndex({ id: reportId, _deleted: true });
    console.log(`[Storage] 🗑️ Отчёт удалён: ${reportId}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[Storage] ⚠️ Попытка удаления несуществующего отчёта: ${reportId}`);
      if (reportsCache !== null) {
        reportsCache = reportsCache.filter(r => r.id !== reportId);
      }
      return false;
    }
    console.error(`[Storage] ❌ Ошибка удаления отчёта ${reportId}:`, error.message);
    throw error;
  }
}

async function deleteAllReports() {
  try {
    const files = await fs.promises.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
    let count = 0;

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
    count = results.filter(Boolean).length;

    reportsCache = [];
    await _compactIndex();
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