const axios = require('axios');

const BATCH_DELAY_MS = 2100;

const DEFAULT_METADATA = {
  skills: [],
  softSkills: [],
  workFormat: 'Не указано',
  grade: 'Не указано', // НОВОЕ ПОЛЕ
  experience_years_min: null, // НОВОЕ ПОЛЕ
  experience_years_max: null, // НОВОЕ ПОЛЕ
  experience: 'Не указано',
  englishLevel: 'Не указано',
  techCategory: 'Другое',
  education: 'Не указано',
};
const VALID_WORK_FORMATS = ['Remote', 'Office', 'Hybrid', 'Не указано'];
const VALID_EXPERIENCES = ['Intern', 'Junior', 'Middle', 'Senior', 'Lead', 'Не указано'];
const VALID_ENGLISH_LEVELS = ['Нет', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Не указано'];
const VALID_TECH_CATEGORIES = ['Frontend', 'Backend', 'Fullstack', 'QA', 'DevOps', 'Mobile', 'Data Science', 'Другое'];
const VALID_EDUCATIONS = ['Высшее', 'Среднее', 'Не требуется', 'Не указано'];

let cachedConfig = null;

function getGroqConfig() {
  if (cachedConfig) return cachedConfig;
  const keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
  const modelsStr = process.env.GROQ_MODELS || '';
  const keys = keysStr.split(',').map(k => k.trim()).filter(k => k && !k.startsWith('YOUR_'));
  let models = modelsStr.split(',').map(m => m.trim()).filter(m => m);
  if (models.length === 0) models = ['llama-3.3-70b-versatile'];

  cachedConfig = { keys, models };
  return cachedConfig;
}

function getRandomGroqKey() {
  const config = getGroqConfig();
  if (!config.keys || config.keys.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * config.keys.length);
  return config.keys[randomIndex];
}


const rateLimitChainByKey = new Map();

function waitForRateLimit(apiKey, cancelFlag) {
  const prev = rateLimitChainByKey.get(apiKey) || Promise.resolve();
  const next = prev.then(() => cancellableDelay(BATCH_DELAY_MS, cancelFlag).catch(() => {}));
  rateLimitChainByKey.set(apiKey, next);
  return prev;
}

async function extractMetadataFromJobs(jobs, onProgress = null, isDeepScrape = false, cancelFlag = null) {
  const groqConfig = getGroqConfig();

  if (!groqConfig.keys.length) {
    console.warn('[AI] ⚠️ Провайдеры (Groq) не настроены. Метаданные не будут извлечены.');
    return jobs.map((job) => ({
      ...job,
      skills: job.skills || [],
      softSkills: [],
      workFormat: job.workFormat || 'Не указано',
      experience: job.experience || 'Не указано',
      englishLevel: 'Не указано',
      techCategory: 'Другое',
      education: 'Не указано',
    }));
  }

  console.log(`[AI] 🤖 Начинаю извлечение метаданных для ${jobs.length} вакансий...`);

  const batchSize = isDeepScrape ? 5 : 10;
  const batches = splitIntoBatches(jobs, batchSize);
  const queue = batches.map((batch, index) => ({ batch, batchIndex: index }));
  const enrichedJobs = [];
  const results = new Array(batches.length);

  let processedBatchesCount = 0;

  async function worker(workerIndex) {
    let currentModelIndex = 0;

    while (queue.length > 0) {
      if (cancelFlag && cancelFlag.isStopped) break;

      const item = queue.shift();
      if (!item) break;
      const { batch, batchIndex } = item;
      let metadataMap = {};
      const randomKey = getRandomGroqKey();

      try {
        if (!randomKey) throw new Error("No Groq API keys available");
        await waitForRateLimit(randomKey, cancelFlag);
        metadataMap = await processBatchWithKey(
          batch,
          randomKey,
          groqConfig.models,
          currentModelIndex,
          (newModelIdx) => { currentModelIndex = newModelIdx; },
          cancelFlag
        );
        console.log(`[AI] ✅ Батч ${batchIndex + 1}/${batches.length} обработан (поток ${workerIndex + 1}).`);
      } catch (orError) {
        if (cancelFlag && cancelFlag.isStopped) break;
        console.warn(`[AI] ⚠️ Ошибка батча ${batchIndex + 1} в потоке ${workerIndex + 1}: ${orError.message}`);
      }

      results[batchIndex] = { batch, metadataMap };

      processedBatchesCount++;
      if (onProgress) onProgress(processedBatchesCount, batches.length);
    }
  }

  const workers = [];
  for (let i = 0; i < groqConfig.keys.length; i++) {
    workers.push(worker(i));
  }

  await Promise.all(workers);

  if (cancelFlag && cancelFlag.isStopped) {
    console.log('[AI] 🛑 Извлечение метаданных отменено пользователем.');
  }

  for (let i = 0; i < results.length; i++) {
    if (!results[i]) continue;
    const { batch, metadataMap } = results[i];
    for (let j = 0; j < batch.length; j++) {
      const aiData = metadataMap ? (metadataMap[String(j)] || {}) : {};
      enrichedJobs.push(mergeAiMetadata(batch[j], aiData));
    }
  }

  const totalSkills = enrichedJobs.reduce((sum, j) => sum + j.skills.length, 0);
  console.log(`[AI] 🏁 Извлечение завершено. Найдено навыков: ${totalSkills}`);

  return enrichedJobs;
}

function getValidEnum(value, validList, defaultValue) {
  return validList.includes(value) ? value : defaultValue;
}

const UNINFORMATIVE_VALUES = new Set(['Не указано']);

function getValidEnumPreferJob(aiValue, jobValue, validList, defaultValue) {
  const validAi = validList.includes(aiValue) ? aiValue : null;

  if (validAi && !UNINFORMATIVE_VALUES.has(validAi)) return validAi;

  const validJob = validList.includes(jobValue) ? jobValue : null;
  if (validJob) return validJob;
  return defaultValue;
}

function sanitizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(item => (typeof item === 'string' ? item : (item != null ? String(item) : null)))
    .map(s => s ? s.trim() : null)
    .filter(Boolean);
}

function mergeAiMetadata(job, aiData) {
  const jobSkills = sanitizeStringArray(job.skills);
  const aiSkills = sanitizeStringArray(aiData.skills);
  
  const mergedSkillsMap = new Map();
  for (const s of jobSkills) mergedSkillsMap.set(s.toLowerCase(), s);
  for (const s of aiSkills) mergedSkillsMap.set(s.toLowerCase(), s);
  
  const mergedSkills = Array.from(mergedSkillsMap.values());
  const cleanSoftSkills = sanitizeStringArray(aiData.softSkills);
  return {
    ...job,
    skills: mergedSkills.length > 0 ? mergedSkills : DEFAULT_METADATA.skills,
    softSkills: cleanSoftSkills.length > 0 ? cleanSoftSkills : DEFAULT_METADATA.softSkills,
    workFormat: getValidEnumPreferJob(aiData.workFormat, job.workFormat, VALID_WORK_FORMATS, DEFAULT_METADATA.workFormat),
    grade: getValidEnum(aiData.grade, VALID_EXPERIENCES, DEFAULT_METADATA.grade),
    experience_years_min: typeof aiData.experience_years_min === 'number' ? aiData.experience_years_min : DEFAULT_METADATA.experience_years_min,
    experience_years_max: typeof aiData.experience_years_max === 'number' ? aiData.experience_years_max : DEFAULT_METADATA.experience_years_max,
    experience: getValidEnumPreferJob(aiData.experience, job.experience, VALID_EXPERIENCES, DEFAULT_METADATA.experience),
    englishLevel: getValidEnum(aiData.englishLevel, VALID_ENGLISH_LEVELS, DEFAULT_METADATA.englishLevel),
    techCategory: getValidEnum(aiData.techCategory, VALID_TECH_CATEGORIES, DEFAULT_METADATA.techCategory),
    education: getValidEnum(aiData.education, VALID_EDUCATIONS, DEFAULT_METADATA.education),
  };
}

async function processBatchWithKey(batch, apiKey, models, startModelIndex, updateModelIndexCallback, cancelFlag) {
  let attempts = 0;
  const maxAttempts = models.length + 1;
  let currentModelIdx = startModelIndex;

  while (attempts < maxAttempts) {
    if (cancelFlag && cancelFlag.isStopped) throw new Error('Canceled');

    const model = models[currentModelIdx];
    try {
      return await processBatchOpenAI(batch, apiKey, 'https://api.groq.com/openai/v1/chat/completions', model, cancelFlag);
    } catch (error) {
      if (cancelFlag && cancelFlag.isStopped) throw error;

      const isQuotaError = error.response && [401, 402, 403, 429].includes(error.response.status);

      attempts++;
      currentModelIdx = (currentModelIdx + 1) % models.length;
      updateModelIndexCallback(currentModelIdx);

      const nextModel = models[currentModelIdx];

      if (isQuotaError) {
        console.warn(`[AI] 🔁 Ошибка 429/Квота. Поток переключается на модель ${nextModel}...`);
        try { await cancellableDelay(1500 * attempts, cancelFlag); } catch { throw new Error('Canceled'); }
        continue;
      }

      console.warn(`[AI] ⚠️ Ошибка запроса к API. Поток переключается на ${nextModel}...`);
      try { await cancellableDelay(2000, cancelFlag); } catch { throw new Error('Canceled'); }
      continue;
    }
  }
  throw new Error('All models failed for this key');
}

function buildAxiosOptions(apiKey, cancelFlag) {
  const options = {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 60000
  };
  if (cancelFlag?.abortController) {
    options.signal = cancelFlag.abortController.signal;
  }
  return options;
}

async function processBatchOpenAI(batch, apiKey, url, model, cancelFlag) {
  const prompt = generatePrompt(batch);

  const response = await axios.post(url, {
    model: model,
    messages: [
      { role: 'system', content: 'You are a helpful data extraction assistant. You must output only a valid JSON object. Do not include markdown formatting or explanations.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  }, buildAxiosOptions(apiKey, cancelFlag));

  const rawText = response.data?.choices?.[0]?.message?.content || '{}';
  return parseJsonFromAi(rawText, batch.length);
}

function safeTruncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, '');
}

function generatePrompt(batch) {
  const payload = batch.map((job, idx) => ({
    id: String(idx),
    text: safeTruncate(`${job.title || ''} | ${job.description || ''}`.trim(), 1500)
  }));
  return `Проанализируй описания ${batch.length} вакансий. Для КАЖДОЙ извлеки структурированные метаданные.
ПРАВИЛА:
- Возвращай ТОЛЬКО JSON-объект, где ключи — это ID вакансии (строки "0", "1", ...).
- Каждое значение — объект с РОВНО 10 полями:
  1. "skills": массив Hard Skills (["React", "Node.js"]). Навыки кратко (1-2 слова). Если нет — [].
  2. "softSkills": массив Soft Skills. Если нет — [].
  3. "workFormat": СТРОГО одно из: "Remote", "Office", "Hybrid", "Не указано".
  4. "grade": СТРОГО одно из: "Intern", "Junior", "Middle", "Senior", "Lead", "Не указано".
  5. "experience_years_min": МИНИМАЛЬНЫЙ требуемый опыт в годах (число, например 1). Если не указано — null.
  6. "experience_years_max": МАКСИМАЛЬНЫЙ требуемый опыт в годах (число, например 3). Если не указано — null.
  7. "experience": СТРОГО одно из: "Intern", "Junior", "Middle", "Senior", "Lead", "Не указано".
  8. "englishLevel": СТРОГО одно из: "Нет", "A1", "A2", "B1", "B2", "C1", "C2", "Не указано".
  9. "techCategory": СТРОГО одно из: "Frontend", "Backend", "Fullstack", "QA", "DevOps", "Mobile", "Data Science", "Другое".
  10. "education": СТРОГО одно из: "Высшее", "Среднее", "Не требуется", "Не указано".
Пример ответа:
{
  "0": {
    "skills": ["React", "TypeScript", "Node.js"],
    "softSkills": ["Работа в команде"],
    "workFormat": "Remote",
    "grade": "Middle",
    "experience_years_min": 1,
    "experience_years_max": 3,
    "experience": "Middle",
    "englishLevel": "B2",
    "techCategory": "Frontend",
    "education": "Не указано"
  }
}
ОПИСАНИЯ (JSON):
${JSON.stringify(payload, null, 2)}
ОТВЕТ (ТОЛЬКО JSON-объект):`;
}

function parseJsonFromAi(rawText, expectedLength) {
  try {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('No JSON object found in AI response');
    }

    const jsonStr = rawText.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr);

    if (Object.keys(parsed).length === 0 && expectedLength > 0) {
      throw new Error('Parsed JSON is empty, expected data');
    }

    return parsed;
  } catch (e) {
    console.error(`[AI] ❌ Ошибка валидации/парсинга JSON: ${e.message}`);
    if (process.env.NODE_ENV === 'development' || process.env.AI_DEBUG === 'true') {
      console.error(`[AI] 📝 Сырой ответ ИИ: ${rawText.substring(0, 300)}...`);
    }
    throw new Error(`Parse AI JSON Error: ${e.message}`);
  }
}

function splitIntoBatches(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}


function cancellableDelay(ms, cancelFlag) {
  if (cancelFlag && cancelFlag.isStopped) return Promise.reject(new Error('Canceled'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const signal = cancelFlag?.abortController?.signal;
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); reject(new Error('Canceled')); return; }
      const onAbort = () => { clearTimeout(timer); reject(new Error('Canceled')); };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function generateCandidateProfile(report, cancelFlag = null) {
  const jobs = report.jobs || [];
  if (!jobs.length) return "Нет данных для анализа.";
  if (cancelFlag && cancelFlag.isStopped) return "Анализ отменён.";

  const skillsCount = {};
  const formats = {};
  const experiences = {};

  for (const j of jobs) {
    for (const s of (j.skills || [])) {
      skillsCount[s] = (skillsCount[s] || 0) + 1;
    }
    if (j.workFormat) formats[j.workFormat] = (formats[j.workFormat] || 0) + 1;
    if (j.experience) experiences[j.experience] = (experiences[j.experience] || 0) + 1;
  }

  const sortedSkills = Object.entries(skillsCount).sort((a, b) => b[1] - a[1]);
  const topSkills = sortedSkills.length > 0
    ? sortedSkills.slice(0, 15).map(e => `${e[0]} (${e[1]} вакансий)`).join(', ')
    : 'Нет данных о навыках';

  const topFormat = Object.entries(formats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Неизвестно';
  const topExp = Object.entries(experiences).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Неизвестно';

  const safeQuery = report.query
    ? report.query.replace(/[\r\n"\\]/g, ' ').trim()
    : '';

  const prompt = `Ты — экспертный IT-рекрутер и аналитик рынка труда.
Я собрал данные по вакансиям по запросу "${safeQuery}".
Всего вакансий: ${jobs.length}.
Топ востребованных навыков: ${topSkills}.
Самый частый формат работы: ${topFormat}.
Самый частый требуемый опыт: ${topExp}.

На основе этих данных, составь краткий и красивый "Портрет идеального кандидата" в формате Markdown.
Структура ответа должна включать:
1. **Резюме** — кто этот специалист на рынке сейчас.
2. **Ключевые компетенции** (Hard & Soft skills).
3. **Требования рынка** (ожидания по опыту и формату работы).
4. **Рекомендации кандидату** (на что сделать упор при поиске и развитию).

Пиши профессионально, ёмко, используй эмодзи и Markdown (жирный текст, списки). Не выводи никаких JSON, только красивый текст.`;

  return await generateTextFromAI(prompt, cancelFlag);
}

async function generateTextFromAI(prompt, cancelFlag = null) {
  const config = getGroqConfig();

  if (config.keys.length > 0) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = getRandomGroqKey();
      const model = config.models[0] || 'llama-3.3-70b-versatile';
      if (cancelFlag && cancelFlag.isStopped) return "Анализ отменён.";

      try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }, buildAxiosOptions(key, cancelFlag));

        return response.data?.choices?.[0]?.message?.content || "Не удалось сгенерировать сводку.";
      } catch (error) {
        if (cancelFlag && cancelFlag.isStopped) return "Анализ отменён.";

        const isQuotaError = error.response && [401, 402, 403, 429].includes(error.response.status);

        if (isQuotaError) {
          console.warn(`[AI] 🔁 Лимит ключа исчерпан (генерация сводки). Переключаюсь...`);
          try { await cancellableDelay(1500, cancelFlag); } catch { return "Анализ отменён."; }
          continue;
        }
        console.warn(`[AI] ⚠️ Ошибка генерации текста (без деталей). Переключаюсь...`);
        try { await cancellableDelay(2000, cancelFlag); } catch { return "Анализ отменён."; }
        continue;
      }
    }
    console.warn('[AI] ❌ Все попытки исчерпаны для генерации сводки.');
  }

  return "Ошибка: Не настроен AI провайдер (Groq) для генерации сводки.";
}

module.exports = {
  extractMetadataFromJobs,
  generateCandidateProfile,
};
