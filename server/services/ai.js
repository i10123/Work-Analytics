/**
 * @file ai.js — Модуль интеграции с ИИ-провайдерами (Gemini, DeepSeek, OpenRouter).
 * @description Извлекает IT-навыки из текстовых описаний вакансий.
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

/** Количество вакансий в одном батче */
const BATCH_SIZE = 10;

/** Задержка между батчами (мс) */
const BATCH_DELAY_MS = 4500;

/** Текущий индекс используемого ключа OpenRouter */
let currentOpenRouterKeyIndex = 0;

async function extractSkillsFromJobs(jobs) {
  const openRouterKeys = getOpenRouterKeys();

  if (!openRouterKeys.length && !puter) {
    console.warn('[AI] ⚠️ Провайдеры (OpenRouter, Puter) не настроены. Навыки не будут извлечены.');
    return jobs.map((job) => ({ ...job, skills: [] }));
  }

  console.log(`[AI] 🤖 Начинаю извлечение навыков для ${jobs.length} вакансий...`);

  const batches = splitIntoBatches(jobs, BATCH_SIZE);
  const enrichedJobs = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[AI] 📦 Обработка батча ${i + 1}/${batches.length}...`);

    let skillsMap = null;

    // 1. Попытка через OpenRouter (с ротацией ключей)
    if (openRouterKeys.length > 0) {
      try {
        skillsMap = await processBatchOpenRouterWithRotation(batch, openRouterKeys);
      } catch (orError) {
        console.warn(`[AI] ⚠️ Ошибка OpenRouter (все ключи исчерпаны или сбой): ${orError.message}`);
      }
    }

    // 2. Попытка через Puter (если OpenRouter не сработал)
    if (!skillsMap && puter) {
      console.log(`[AI] 🔄 Пробую резервный провайдер: Puter (DeepSeek)...`);
      try {
        skillsMap = await processBatchPuter(batch);
      } catch (puterError) {
        console.error(`[AI] ❌ Ошибка резервного провайдера (Puter): ${puterError.message}`);
      }
    }

    /** Присваиваем навыки (или пустые массивы при фиаско) */
    for (let j = 0; j < batch.length; j++) {
      enrichedJobs.push({
        ...batch[j],
        skills: skillsMap ? (skillsMap[j] || []) : [],
      });
    }

    if (skillsMap) {
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
      if (isQuotaError) {
        console.warn(`[AI] 🔁 Лимит OpenRouter ключа #${currentOpenRouterKeyIndex + 1} исчерпан/ошибка квоты. Переключаюсь...`);
        currentOpenRouterKeyIndex++;
        attempts++;
        continue;
      }
      console.warn(`[AI] ⚠️ Сетевая ошибка OpenRouter (не квота): ${error.message}. Ждем 2 сек...`);
      await delay(2000);
      attempts++;
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
      { role: 'system', content: 'Ты — эксперт по IT-навыкам. Возвращай ТОЛЬКО JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' } // DeepSeek поддерживает это
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 45000
  });

  const rawText = response.data?.choices?.[0]?.message?.content || '[]';
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

  const rawText = response.message?.content || '[]';
  return parseJsonFromAi(rawText, batch.length);
}

// --- HELPERS ---

function generatePrompt(batch) {
  const descriptions = batch
    .map((job, idx) => {
      const text = (job.description || job.title || '').substring(0, 1500);
      return `--- Вакансия ${idx + 1} ---\n${text}`;
    })
    .join('\n\n');

  return `Проанализируй описания ${batch.length} вакансий. Для КАЖДОЙ извлеки список IT-навыков.
ПРАВИЛА:
- Возвращай ТОЛЬКО JSON-массив массивов: [[навыки1], [навыки2], ...]
- Навыки кратко (1-2 слова): "React", "Python".
- Если навыков нет — [].
- Количество внутренних массивов должно быть ровно ${batch.length}.

ОПИСАНИЯ:
${descriptions}

ОТВЕТ (ТОЛЬКО JSON):`;
}

function parseJsonFromAi(rawText, expectedLength) {
  try {
    const match = rawText.match(/\[\s*\[.*\]\s*\]/s) || rawText.match(/\[.*\]/s);
    const jsonStr = match ? match[0] : '[]';
    
    const parsed = JSON.parse(jsonStr);
    let result = Array.isArray(parsed) ? parsed : (parsed.skills || parsed.data || []);
    
    if (Array.isArray(result) && result.every(Array.isArray)) {
      return result;
    }
    if (Array.isArray(result)) {
      // Если пришел плоский массив вместо массива массивов
      return [result];
    }
    return new Array(expectedLength).fill([]);
  } catch (e) {
    console.error('[AI] ❌ Ошибка парсинга JSON:', e.message);
    return new Array(expectedLength).fill([]);
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
  extractSkillsFromJobs,
};
