/**
 * @file ai.js — Модуль интеграции с ИИ-провайдерами (Gemini, DeepSeek, OpenRouter).
 * @description Извлекает структурированные метаданные из текстовых описаний вакансий:
 *              skills, softSkills, workFormat, experience, englishLevel, techCategory, education.
 *              Поддерживает ротацию ключей Gemini и резервные провайдеры (DeepSeek, OpenRouter).
 */

const axios = require('axios');
let puter = null;

try {
  const puterModule = require('@heyputer/puter.js');
  const init = puterModule.init || (puterModule.default && puterModule.default.init);
  if (init && process.env.PUTER_AUTH_TOKEN && process.env.PUTER_AUTH_TOKEN !== 'YOUR_PUTER_AUTH_TOKEN_HERE') {
    puter = init(process.env.PUTER_AUTH_TOKEN);
  }
} catch (e) {
  console.warn('[AI] ⚠️ Модуль @heyputer/puter.js не загружен. Резервный провайдер (Puter) отключен.');
}

/** Количество вакансий в одном батче (уменьшено для стабильности — 7 полей на вакансию) */
const BATCH_SIZE = 5;

/** Задержка между батчами (мс) */
const BATCH_DELAY_MS = 4500;

/** Текущий индекс используемого ключа OpenRouter */
let currentOpenRouterKeyIndex = 0;

/**
 * Значения по умолчанию для AI-метаданных.
 * Используются, когда ИИ не вернул конкретное поле.
 */
const DEFAULT_METADATA = {
  skills: [],
  softSkills: [],
  workFormat: 'Не указано',
  experience: 'Не указано',
  englishLevel: 'Не указано',
  techCategory: 'Другое',
  education: 'Не указано',
};

/**
 * Извлекает структурированные метаданные из массива вакансий через AI.
 * Результат содержит все 7 полей для каждой вакансии.
 * Данные AI полностью перезаписывают данные HTML-парсера.
 *
 * @param {Array<Object>} jobs — Массив вакансий с полем description.
 * @returns {Promise<Array<Object>>} — Обогащённые вакансии с AI-метаданными.
 */
async function extractMetadataFromJobs(jobs) {
  const openRouterKeys = getOpenRouterKeys();

  if (!openRouterKeys.length && !puter) {
    console.warn('[AI] ⚠️ Провайдеры (OpenRouter, Puter) не настроены. Метаданные не будут извлечены.');
    // Проставляем дефолтные значения, сохраняя навыки парсера
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

  const batches = splitIntoBatches(jobs, BATCH_SIZE);
  const enrichedJobs = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[AI] 📦 Обработка батча ${i + 1}/${batches.length}...`);

    let metadataMap = null;

    // 1. Попытка через OpenRouter (с ротацией ключей)
    if (openRouterKeys.length > 0) {
      try {
        metadataMap = await processBatchOpenRouterWithRotation(batch, openRouterKeys);
      } catch (orError) {
        console.warn(`[AI] ⚠️ Ошибка OpenRouter (все ключи исчерпаны или сбой): ${orError.message}`);
      }
    }

    // 2. Попытка через Puter (если OpenRouter не сработал)
    if (!metadataMap && puter) {
      console.log(`[AI] 🔄 Пробую резервный провайдер: Puter (DeepSeek)...`);
      try {
        metadataMap = await processBatchPuter(batch);
      } catch (puterError) {
        console.error(`[AI] ❌ Ошибка резервного провайдера (Puter): ${puterError.message}`);
      }
    }

    /** Присваиваем метаданные (или дефолтные при фиаско) */
    for (let j = 0; j < batch.length; j++) {
      const aiData = metadataMap ? (metadataMap[String(j)] || {}) : {};
      enrichedJobs.push(mergeAiMetadata(batch[j], aiData));
    }

    if (metadataMap) {
      console.log(`[AI] ✅ Батч ${i + 1} обработан.`);
    } else {
      console.error(`[AI] ❌ Батч ${i + 1} не удалось обработать ни одним провайдером.`);
    }

    /** Пауза между батчами */
    if (i < batches.length - 1) {
      await delay(BATCH_DELAY_MS);
    }
  }

  const totalSkills = enrichedJobs.reduce((sum, j) => sum + j.skills.length, 0);
  console.log(`[AI] 🏁 Извлечение завершено. Найдено навыков: ${totalSkills}`);

  return enrichedJobs;
}

/**
 * Объединяет данные вакансии с AI-метаданными.
 * AI-данные полностью перезаписывают данные HTML-парсера,
 * ЕСЛИ ИИ вернул непустое значение.
 *
 * @param {Object} job — Исходная вакансия.
 * @param {Object} aiData — Метаданные от ИИ.
 * @returns {Object} — Обогащённая вакансия.
 */
function mergeAiMetadata(job, aiData) {
  return {
    ...job,
    // Hard Skills: AI полностью перезаписывает, если вернул непустой массив
    skills: (Array.isArray(aiData.skills) && aiData.skills.length > 0)
      ? aiData.skills
      : (job.skills || DEFAULT_METADATA.skills),
    // Soft Skills: новое поле, только от AI
    softSkills: Array.isArray(aiData.softSkills)
      ? aiData.softSkills
      : DEFAULT_METADATA.softSkills,
    // Формат работы: AI перезаписывает
    workFormat: (aiData.workFormat && aiData.workFormat !== 'Не указано')
      ? aiData.workFormat
      : (job.workFormat || DEFAULT_METADATA.workFormat),
    // Опыт: AI перезаписывает
    experience: (aiData.experience && aiData.experience !== 'Не указано')
      ? aiData.experience
      : (job.experience || DEFAULT_METADATA.experience),
    // Уровень английского: только от AI
    englishLevel: aiData.englishLevel || DEFAULT_METADATA.englishLevel,
    // Техническая категория: только от AI
    techCategory: aiData.techCategory || DEFAULT_METADATA.techCategory,
    // Образование: только от AI
    education: aiData.education || DEFAULT_METADATA.education,
  };
}

// --- OPENROUTER LOGIC ---

function getOpenRouterKeys() {
  const keysStr = process.env.OPENROUTER_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  return keysStr.split(',').map(k => k.trim()).filter(k => k && !k.startsWith('YOUR_'));
}

async function processBatchOpenRouterWithRotation(batch, keys) {
  let attempts = 0;
  const maxAttempts = keys.length;

  while (attempts < maxAttempts) {
    const currentKey = keys[currentOpenRouterKeyIndex % keys.length];
    try {
      // Используем Gemini 2.0 Flash через OpenRouter
      return await processBatchOpenAI(batch, currentKey, 'https://openrouter.ai/api/v1/chat/completions', 'google/gemini-2.0-flash-001');
    } catch (error) {
      const isQuotaError = error.response && (error.response.status === 429 || error.response.status === 403 || error.response.status === 401);
      currentOpenRouterKeyIndex++;
      attempts++;
      if (isQuotaError) {
        console.warn(`[AI] 🔁 Лимит OpenRouter ключа #${(currentOpenRouterKeyIndex) } исчерпан/ошибка квоты. Переключаюсь...`);
        continue;
      }
      console.warn(`[AI] ⚠️ Сетевая ошибка OpenRouter (не квота): ${error.message}. Переключаюсь на следующий ключ, ждём 2 сек...`);
      await delay(2000);
      continue;
    }
  }
  throw new Error('OpenRouter quota exhausted or all keys failed');
}

// --- OPENAI-COMPATIBLE LOGIC (DeepSeek, OpenRouter) ---

async function processBatchOpenAI(batch, apiKey, url, model) {
  const prompt = generatePrompt(batch);

  const response = await axios.post(url, {
    model: model,
    messages: [
      { role: 'system', content: 'Ты — эксперт по анализу IT-вакансий. Возвращай ТОЛЬКО JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' } // DeepSeek поддерживает это
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });

  const rawText = response.data?.choices?.[0]?.message?.content || '{}';
  return parseJsonFromAi(rawText, batch.length);
}

// --- PUTER LOGIC ---

async function processBatchPuter(batch) {
  if (!puter) throw new Error('Puter not initialized');
  const prompt = generatePrompt(batch);

  // Используем DeepSeek v3.2 через Puter
  const response = await puter.ai.chat(prompt, { 
    model: 'deepseek/deepseek-v3.2'
  });

  const rawText = response.message?.content || '{}';
  return parseJsonFromAi(rawText, batch.length);
}

// --- HELPERS ---

function safeTruncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, '');
}

function generatePrompt(batch) {
  const payload = batch.map((job, idx) => ({
    id: String(idx),
    text: safeTruncate(job.description || job.title || '', 1500)
  }));

  return `Проанализируй описания ${batch.length} вакансий. Для КАЖДОЙ извлеки структурированные метаданные.

ПРАВИЛА:
- Возвращай ТОЛЬКО JSON-объект, где ключи — это ID вакансии (строки "0", "1", ...).
- Каждое значение — объект с РОВНО 7 полями:
  1. "skills": массив Hard Skills (["React", "Node.js"]). Навыки кратко (1-2 слова). Если нет — [].
  2. "softSkills": массив Soft Skills (["Коммуникабельность", "Работа в команде"]). Если нет — [].
  3. "workFormat": СТРОГО одно из: "Remote", "Office", "Hybrid", "Не указано".
  4. "experience": СТРОГО одно из: "Intern", "Junior", "Middle", "Senior", "Lead", "Не указано".
  5. "englishLevel": СТРОГО одно из: "Нет", "A1", "A2", "B1", "B2", "C1", "C2", "Не указано".
  6. "techCategory": СТРОГО одно из: "Frontend", "Backend", "Fullstack", "QA", "DevOps", "Mobile", "Data Science", "Другое".
  7. "education": СТРОГО одно из: "Высшее", "Среднее", "Не требуется", "Не указано".

Пример ответа:
{
  "0": {
    "skills": ["React", "TypeScript", "Node.js"],
    "softSkills": ["Работа в команде"],
    "workFormat": "Remote",
    "experience": "Middle",
    "englishLevel": "B2",
    "techCategory": "Frontend",
    "education": "Не указано"
  },
  "1": {
    "skills": ["Python", "Django"],
    "softSkills": [],
    "workFormat": "Office",
    "experience": "Senior",
    "englishLevel": "Не указано",
    "techCategory": "Backend",
    "education": "Высшее"
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
    const jsonStr = (firstBrace !== -1 && lastBrace > firstBrace)
      ? rawText.slice(firstBrace, lastBrace + 1)
      : '{}';
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('[AI] ❌ Ошибка парсинга JSON:', e.message);
    return {};
  }
}

function splitIntoBatches(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  extractMetadataFromJobs,
  // Обратная совместимость
  extractSkillsFromJobs: extractMetadataFromJobs,
};
