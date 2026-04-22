/**
 * @file ai.js — Модуль интеграции с ИИ-провайдерами (Gemini, DeepSeek, OpenRouter).
 * @description Извлекает IT-навыки из текстовых описаний вакансий.
 *              Поддерживает ротацию ключей Gemini и резервные провайдеры (DeepSeek, OpenRouter).
 */

const axios = require('axios');

/** Количество вакансий в одном батче */
const BATCH_SIZE = 10;

/** Задержка между батчами (мс) */
const BATCH_DELAY_MS = 4500;

/** Текущий индекс используемого ключа Gemini */
let currentGeminiKeyIndex = 0;

async function extractSkillsFromJobs(jobs) {
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.DASHSCOPE_API_KEY;

  if (!openrouterKey) {
    console.warn('[AI] ⚠️ OpenRouter не настроен в .env. Навыки не будут извлечены.');
    return jobs.map((job) => ({ ...job, skills: [] }));
  }

  console.log(`[AI] 🤖 Начинаю извлечение навыков для ${jobs.length} вакансий через OpenRouter...`);

  const batches = splitIntoBatches(jobs, BATCH_SIZE);
  const enrichedJobs = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[AI] 📦 Обработка батча ${i + 1}/${batches.length}...`);

    let skillsMap = null;

    try {
      skillsMap = await processBatchOpenAI(batch, openrouterKey, 'https://openrouter.ai/api/v1/chat/completions', 'google/gemini-2.0-flash-001');
    } catch (error) {
      console.warn(`[AI] ⚠️ Ошибка OpenRouter: ${error.message}`);
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
      console.error(`[AI] ❌ Батч ${i + 1} не удалось обработать.`);
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

// --- GEMINI LOGIC ---

function getGeminiKeys() {
  const keysStr = process.env.GEMINI_API_KEYS || '';
  return keysStr.split(',').map(k => k.trim()).filter(k => k && !k.startsWith('YOUR_') && !/^key\d*$/.test(k));
}

async function processBatchGeminiWithRotation(batch, keys) {
  let attempts = 0;
  const maxAttempts = keys.length; 

  while (attempts < maxAttempts) {
    const currentKey = keys[currentGeminiKeyIndex % keys.length];
    try {
      return await processBatchGemini(batch, currentKey);
    } catch (error) {
      const isQuotaError = error.response && (error.response.status === 429 || error.response.status === 403);
      if (isQuotaError) {
        console.warn(`[AI] 🔁 Лимит Gemini ключа #${currentGeminiKeyIndex + 1} исчерпан. Переключаюсь...`);
        currentGeminiKeyIndex++;
        attempts++;
        continue;
      }
      throw error;
    }
  }
  throw new Error('Gemini quota exhausted');
}

async function processBatchGemini(batch, apiKey) {
  const prompt = generatePrompt(batch);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
  }, { timeout: 30000 });

  const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  return parseJsonFromAi(rawText, batch.length);
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
  const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
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
