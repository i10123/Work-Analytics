const axios = require('axios');

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 4500;
let currentOpenRouterKeyIndex = 0;

const DEFAULT_METADATA = {
  skills: [],
  softSkills: [],
  workFormat: 'Не указано',
  experience: 'Не указано',
  englishLevel: 'Не указано',
  techCategory: 'Другое',
  education: 'Не указано',
};

async function extractMetadataFromJobs(jobs, onProgress = null) {
  const openRouterKeys = getOpenRouterKeys();

  if (!openRouterKeys.length) {
    console.warn('[AI] ⚠️ Провайдеры (OpenRouter) не настроены. Метаданные не будут извлечены.');
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
  const results = new Array(batches.length);

  let processedBatchesCount = 0;
  let currentIndex = 0;
  const CONCURRENCY_LIMIT = 5;

  async function worker() {
    while (currentIndex < batches.length) {
      const batchIndex = currentIndex++;
      const batch = batches[batchIndex];

      let metadataMap = null;
      if (openRouterKeys.length > 0) {
        try {
          metadataMap = await processBatchOpenRouterWithRotation(batch, openRouterKeys);
          console.log(`[AI] ✅ Батч ${batchIndex + 1}/${batches.length} обработан.`);
        } catch (orError) {
          console.warn(`[AI] ⚠️ Ошибка батча ${batchIndex + 1}: ${orError.message}`);
        }
      }

      results[batchIndex] = { batch, metadataMap };

      processedBatchesCount++;
      if (onProgress) onProgress(processedBatchesCount, batches.length);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, batches.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  for (let i = 0; i < results.length; i++) {
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

function mergeAiMetadata(job, aiData) {
  const mergedSkills = Array.from(new Set([
    ...(job.skills || []),
    ...(Array.isArray(aiData.skills) ? aiData.skills : [])
  ]));

  return {
    ...job,
    skills: mergedSkills.length > 0 ? mergedSkills : DEFAULT_METADATA.skills,
    softSkills: Array.isArray(aiData.softSkills)
      ? aiData.softSkills
      : DEFAULT_METADATA.softSkills,
    workFormat: (aiData.workFormat && aiData.workFormat !== 'Не указано')
      ? aiData.workFormat
      : (job.workFormat || DEFAULT_METADATA.workFormat),
    experience: (aiData.experience && aiData.experience !== 'Не указано')
      ? aiData.experience
      : (job.experience || DEFAULT_METADATA.experience),
    englishLevel: aiData.englishLevel || DEFAULT_METADATA.englishLevel,
    techCategory: aiData.techCategory || DEFAULT_METADATA.techCategory,
    education: aiData.education || DEFAULT_METADATA.education,
  };
}

function getOpenRouterKeys() {
  const keysStr = process.env.OPENROUTER_API_KEY || '';
  return keysStr.split(',').map(k => k.trim()).filter(k => k && !k.startsWith('YOUR_'));
}

async function processBatchOpenRouterWithRotation(batch, keys) {
  let attempts = 0;
  const maxAttempts = Math.max(keys.length * 2, 3);

  while (attempts < maxAttempts) {
    const currentKey = keys[currentOpenRouterKeyIndex % keys.length];
    try {
      return await processBatchOpenAI(batch, currentKey, 'https://openrouter.ai/api/v1/chat/completions', 'google/gemini-2.0-flash-001');
    } catch (error) {
      const isQuotaError = error.response && [401, 402, 403, 429].includes(error.response.status);
      currentOpenRouterKeyIndex = (currentOpenRouterKeyIndex + 1) % keys.length;
      attempts++;
      if (isQuotaError) {
        console.warn(`[AI] 🔁 429/Квота. Попытка ${attempts}/${maxAttempts}. Переключаюсь/жду...`);
        await delay(1500 * attempts);
        continue;
      }
      console.warn(`[AI] ⚠️ Ошибка: ${error.message}. Попытка ${attempts}/${maxAttempts}.`);
      await delay(2000);
      continue;
    }
  }
  throw new Error('OpenRouter quota exhausted or all keys failed (including parse errors)');
}

async function processBatchOpenAI(batch, apiKey, url, model) {
  const prompt = generatePrompt(batch);

  const response = await axios.post(url, {
    model: model,
    messages: [
      { role: 'system', content: 'Ты — эксперт по анализу IT-вакансий. Возвращай ТОЛЬКО JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
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

function safeTruncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, '');
}

function generatePrompt(batch) {
  const payload = batch.map((job, idx) => ({
    id: String(idx),
    text: safeTruncate(`${job.title || ''}\n${job.description || ''}`.trim(), 1500)
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
  },
  "2": {
    "skills": [],
    "softSkills": [],
    "workFormat": "Не указано",
    "experience": "Не указано",
    "englishLevel": "Не указано",
    "techCategory": "Другое",
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

    const jsonStr = rawText.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr);

    if (Object.keys(parsed).length === 0 && expectedLength > 0) {
      throw new Error('Parsed JSON is empty, expected data');
    }

    return parsed;
  } catch (e) {
    console.error(`[AI] ❌ Ошибка валидации/парсинга JSON: ${e.message}`);
    console.error(`[AI] 📝 Сырой ответ ИИ (первые 300 символов): ${rawText.substring(0, 300)}...`);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateCandidateProfile(report) {
  const jobs = report.jobs || [];
  if (!jobs.length) return "Нет данных для анализа.";

  const skillsCount = {};
  const formats = {};
  const experiences = {};

  jobs.forEach(j => {
    (j.skills || []).forEach(s => {
      skillsCount[s] = (skillsCount[s] || 0) + 1;
    });
    if (j.workFormat) formats[j.workFormat] = (formats[j.workFormat] || 0) + 1;
    if (j.experience) experiences[j.experience] = (experiences[j.experience] || 0) + 1;
  });

  const topSkills = Object.entries(skillsCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(e => `${e[0]} (${e[1]} вакансий)`)
    .join(', ');

  const topFormat = Object.entries(formats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Неизвестно';
  const topExp = Object.entries(experiences).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Неизвестно';

  const prompt = `Ты — экспертный IT-рекрутер и аналитик рынка труда.
Я собрал данные по вакансиям по запросу "${report.query}".
Всего вакансий: ${jobs.length}.
Топ востребованных навыков: ${topSkills}.
Самый частый формат работы: ${topFormat}.
Самый частый требуемый опыт: ${topExp}.

На основе этих данных, составь краткий и красивый "Портрет идеального кандидата" в формате Markdown.
Структура ответа должна включать:
1. **Резюме** — кто этот специалист на рынке сейчас.
2. **Ключевые компетенции** (Hard & Soft skills).
3. **Требования рынка** (ожидания по опыту и формату работы).
4. **Рекомендации кандидату** (на что сделать упор при поиске и развитии).

Пиши профессионально, ёмко, используй эмодзи и Markdown (жирный текст, списки). Не выводи никаких JSON, только красивый текст.`;

  return await generateTextFromAI(prompt);
}

async function generateTextFromAI(prompt) {
  const openRouterKeys = getOpenRouterKeys();
  if (openRouterKeys.length > 0) {
    let attempts = 0;
    const maxAttempts = openRouterKeys.length;

    while (attempts < maxAttempts) {
      const apiKey = openRouterKeys[currentOpenRouterKeyIndex % openRouterKeys.length];
      try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: 'google/gemini-2.0-flash-001',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 60000
        });
        return response.data?.choices?.[0]?.message?.content || "Не удалось сгенерировать сводку.";
      } catch (error) {
        const isQuotaError = error.response && [401, 402, 403, 429].includes(error.response.status);
        currentOpenRouterKeyIndex = (currentOpenRouterKeyIndex + 1) % openRouterKeys.length;
        attempts++;
        if (isQuotaError) {
          console.warn(`[AI] 🔁 Лимит OpenRouter ключа исчерпан/ошибка квоты (генерация сводки). Переключаюсь...`);
          continue;
        }
        console.warn(`[AI] ⚠️ Ошибка генерации текста через OpenRouter: ${error.message}. Переключаюсь...`);
        await delay(2000);
        continue;
      }
    }
    console.warn('[AI] ❌ Все ключи OpenRouter исчерпаны или недоступны для генерации сводки. Пробую резервный провайдер...');
  }

  return "Ошибка: Не настроен AI провайдер (OpenRouter) для генерации сводки.";
}

module.exports = {
  extractMetadataFromJobs,
  extractSkillsFromJobs: extractMetadataFromJobs,
  generateCandidateProfile,
};

