const { fetchExchangeRates, convertCurrency } = require('./currency');
const { extractMetadataFromJobs } = require('./ai');
const { saveReport } = require('./storage');
const { deduplicateJobs } = require('./dedup');
const { HhParser } = require('../parsers/hh');
const { RabotaByParser } = require('../parsers/rabotaby');
const { HabrParser } = require('../parsers/habr');

const hhParser = new HhParser();
const rabotabyParser = new RabotaByParser();
const habrParser = new HabrParser();

async function runParsersWithRetry(query, filters, cancelFlag) {
  const allowedSources = filters.sources || { hh: true, rabotaby: true, habr: true };

  const parsers = [
    { name: 'hh', fn: (q, f, cf) => hhParser.parse(q, f, cf) },
    { name: 'rabotaby', fn: (q, f, cf) => rabotabyParser.parse(q, f, cf) },
    { name: 'habr', fn: (q, f, cf) => habrParser.parse(q, f, cf) },
  ].filter(p => allowedSources[p.name] === true);

  if (parsers.length === 0) {
    console.warn(`[Pipeline] ⚠️ Для запроса "${query}" не выбрано ни одного источника.`);
    return [];
  }

  const MAX_RETRIES = 3;

  const results = await Promise.all(
    parsers.map(async (parser) => {
      let lastError = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (cancelFlag.isStopped) {
          console.log(`[Pipeline] 🛑 ${parser.name}: задача остановлена, прерываем retry.`);
          return { source: parser.name, success: false, jobs: [] };
        }

        try {
          console.log(`[Pipeline] 🔄 ${parser.name}: попытка ${attempt}/${MAX_RETRIES}...`);
          const jobs = await parser.fn(query, filters, cancelFlag);
          console.log(`[Pipeline] ✅ ${parser.name}: получено ${jobs.length} вакансий.`);
          return { source: parser.name, success: true, jobs };
        } catch (error) {
          if (cancelFlag.isStopped || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
            console.log(`[Pipeline] 🛑 ${parser.name}: задача остановлена (abort).`);
            return { source: parser.name, success: false, jobs: [] };
          }

          lastError = error;
          console.warn(`[Pipeline] ⚠️ ${parser.name}: попытка ${attempt} не удалась — ${error.message}`);
          if (attempt < MAX_RETRIES) {
            const backoff = attempt * 3000;
            console.log(`[Pipeline] ⏳ ${parser.name}: ожидание ${backoff}мс перед повтором...`);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }

      console.error(`[Pipeline] ❌ ${parser.name}: все ${MAX_RETRIES} попытки провалились. Последняя ошибка:`, lastError);
      return { source: parser.name, success: false, jobs: [] };
    })
  );

  return results;
}


async function runPipeline(task, emitUpdate) {
  let isCancelled = () => task.cancelFlag.isStopped;

  console.log(`[Pipeline] 💱 Получение курсов валют...`);
  emitUpdate({ ...task, step: 'Получение курсов валют...' });
  const exchangeRates = await fetchExchangeRates();
  if (isCancelled()) return;

  console.log(`[Pipeline] 🔍 Запуск парсеров для запроса: "${task.query}"...`);
  emitUpdate({ ...task, step: 'Парсинг вакансий...' });

  const parserResults = await runParsersWithRetry(task.query, task.filters, task.cancelFlag);

  let allJobs = [];
  const errors = [];

  for (const result of parserResults) {
    if (result.success) {
      allJobs.push(...result.jobs);
    } else {
      errors.push(result.source);
    }
  }

  if (isCancelled() && allJobs.length === 0) {
    console.log('[Pipeline] Задача отменена, вакансий не собрано.');
    return;
  }

  const { uniqueJobs, stats } = deduplicateJobs(allJobs);
  allJobs = uniqueJobs;
  console.log(`[Pipeline] 🔄 Дедупликация: ${stats.totalBefore} → ${stats.totalAfter} (удалено ${stats.duplicatesRemoved} дублей)`);
  if (stats.duplicatesRemoved > 0) {
    console.log(`[Pipeline] 📋 Список удаленных дубликатов:`);
    stats.mergedPairs.forEach((pair, idx) => {
      console.log(`  [Дубликат #${idx + 1}] (Причина: ${pair.reason})`);
      console.log(`    ❌ Удален:      [${pair.duplicate.source.toUpperCase()}] "${pair.duplicate.title}" от "${pair.duplicate.company}" (${pair.duplicate.url})`);
      console.log(`    ✅ Сохранен в:  [${pair.primary.source.toUpperCase()}] "${pair.primary.title}" от "${pair.primary.company}" (${pair.primary.url})`);
    });
  }
  console.log(`[Pipeline] 📊 Собрано вакансий: ${allJobs.length}. Ошибок источников: ${errors.length}`);

  emitUpdate({ ...task, step: 'AI-анализ вакансий...' });
  let enrichedJobs = [];
  try {
    enrichedJobs = await extractMetadataFromJobs(
      allJobs,
      (current, total, statusText) => {
        const percentage = Math.round((current / total) * 100);
        emitUpdate({
          ...task,
          step: statusText || `AI-анализ вакансий: обработано ${current} из ${total} батчей...`,
          progress: percentage
        });
      },
      task.filters.deepScrape,
      task.cancelFlag
    );
  } catch (err) {
    console.warn(`[Pipeline] ⚠️ Ошибка или прерывание AI: ${err.message}`);
  }

  
  const enrichedIds = new Set(enrichedJobs.map(j => j.sourceId));
  for (const job of allJobs) {
    if (!enrichedIds.has(job.sourceId)) {
      enrichedJobs.push(job);
    }
  }

  let sumSalaryByn = 0;
  let countSalary = 0;
  const sourceCounts = { hh: 0, rabotaby: 0, habr: 0 };

  for (const job of enrichedJobs) {
    
    if (sourceCounts[job.source] !== undefined) {
      sourceCounts[job.source]++;
    }

    
    if (job.salary && (job.salary.min || job.salary.max)) {
      const avg = job.salary.min && job.salary.max
        ? (job.salary.min + job.salary.max) / 2
        : job.salary.min || job.salary.max;
      const inByn = convertCurrency(avg, job.salary.currency, 'BYN', exchangeRates.rates);
      sumSalaryByn += inByn;
      countSalary++;
    }
  }
  const avgSalaryNormalized = countSalary > 0 ? Math.round(sumSalaryByn / countSalary) : null;

  let status = (errors.length > 0 && allJobs.length > 0) ? 'partial'
    : (allJobs.length === 0) ? 'failed'
      : 'completed';
      
  if (isCancelled() && allJobs.length > 0) {
    status = 'partial';
  }

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
      sources: sourceCounts,
    },
    errors,
    error: failMessage,
    jobs: enrichedJobs,
  };

  emitUpdate({ ...task, step: 'Сохранение отчёта...' });
  await saveReport(report);
  
  task.status = report.status;
  task.error = failMessage;
  task.reportId = task.id;
  console.log(`[Pipeline] ✅ Конвейер завершен: ${task.id} (статус: ${task.status})`);
  emitUpdate({ ...task, errors, error: failMessage });
}

module.exports = {
  runPipeline
};
