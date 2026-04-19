/**
 * @file ai.js — Модуль интеграции с Google Gemini API.
 * @description Извлекает IT-навыки из текстовых описаний вакансий с помощью ИИ.
 *              Описания отправляются батчами (пачками) по 5 штук, чтобы не превышать
 *              лимит бесплатного API (15 запросов в минуту).
 */

const axios = require('axios');

/** Количество вакансий в одном батче для отправки в Gemini */
const BATCH_SIZE = 5;

/** Задержка между батчами (мс) — защита от rate limit */
const BATCH_DELAY_MS = 4500;

/** Текущий индекс используемого ключа */
let currentKeyIndex = 0;

/**
 * Получает массив ключей из переменной окружения.
 * @returns {string[]}
 */
function getKeys() {
  const keysStr = process.env.GEMINI_API_KEYS || '';
  return keysStr.split(',').map(k => k.trim()).filter(k => k && !k.startsWith('YOUR_') && !/^key\d*$/.test(k));
}

/**
 * Извлекает IT-навыки из массива вакансий с помощью Google Gemini API.
 * Вакансии обрабатываются батчами по {@link BATCH_SIZE} штук.
 *
 * @param {Array<Object>} jobs — Массив объектов вакансий. Каждый объект должен содержать
 *                                поле `description` (текст описания вакансии).
 * @returns {Promise<Array<Object>>} — Тот же массив, но каждый объект обогащён полем `skills: string[]`.
 */
async function extractSkillsFromJobs(jobs) {
  const keys = getKeys();

  /** Если ключи не заданы — возвращаем пустые навыки */
  if (keys.length === 0) {
    console.warn('[AI] ⚠️ Gemini API ключи не заданы в .env (GEMINI_API_KEYS). Навыки не будут извлечены.');
    return jobs.map((job) => ({ ...job, skills: [] }));
  }

  console.log(`[AI] 🤖 Начинаю извлечение навыков для ${jobs.length} вакансий (батчи по ${BATCH_SIZE})...`);

  /** Разбиваем массив вакансий на батчи */
  const batches = splitIntoBatches(jobs, BATCH_SIZE);
  const enrichedJobs = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[AI] 📦 Обработка батча ${i + 1}/${batches.length} (${batch.length} вакансий)...`);

    try {
      const skillsMap = await processBatchWithRotation(batch, keys);

      /** Присваиваем навыки каждой вакансии в батче */
      for (let j = 0; j < batch.length; j++) {
        enrichedJobs.push({
          ...batch[j],
          skills: skillsMap[j] || [],
        });
      }

      console.log(`[AI] ✅ Батч ${i + 1} обработан.`);
    } catch (error) {
      console.error(`[AI] ❌ Ошибка обработки батча ${i + 1}: ${error.message}`);
      /** При ошибке — добавляем вакансии без навыков */
      for (const job of batch) {
        enrichedJobs.push({ ...job, skills: [] });
      }
    }

    /** Пауза между батчами (кроме последнего) */
    if (i < batches.length - 1) {
      console.log(`[AI] ⏳ Пауза ${BATCH_DELAY_MS}мс перед следующим батчем...`);
      await delay(BATCH_DELAY_MS);
    }
  }

  const totalSkills = enrichedJobs.reduce((sum, j) => sum + j.skills.length, 0);
  console.log(`[AI] 🏁 Извлечение завершено. Найдено навыков: ${totalSkills}`);

  return enrichedJobs;
}

/**
 * Пробует выполнить батч, если лимит — переключает ключ и пробует снова (каждый ключ до 2 раз).
 *
 * @param {Array<Object>} batch — Батч вакансий.
 * @param {string[]} keys — Пул ключей.
 */
async function processBatchWithRotation(batch, keys) {
  let attempts = 0;
  const maxAttempts = keys.length * 2; // Пробуем каждый ключ дважды при ошибках

  while (attempts < maxAttempts) {
    const currentKey = keys[currentKeyIndex % keys.length];
    
    try {
      return await processBatch(batch, currentKey);
    } catch (error) {
      const isQuotaError = error.response && (error.response.status === 429 || error.response.status === 403);
      
      if (isQuotaError) {
        console.warn(`[AI] 🔁 Лимит ключа #${currentKeyIndex + 1} исчерпан (HTTP ${error.response.status}). Переключаюсь на следующий...`);
        currentKeyIndex++;
        attempts++;
        continue; // Сразу пробуем следующий ключ
      }
      
      // Если другая ошибка — выбрасываем её вверх
      throw error;
    }
  }
  
  throw new Error('Все доступные API-ключи Gemini выдали ошибку лимита.');
}

/**
 * Отправляет батч описаний вакансий в Gemini API и получает массив навыков.
 *
 * @param {Array<Object>} batch — Массив вакансий (с полем description).
 * @param {string} apiKey — API-ключ Google Gemini.
 * @returns {Promise<Array<Array<string>>>} — Массив массивов навыков (по одному на вакансию).
 */
async function processBatch(batch, apiKey) {

  /** Формируем текст для ИИ: нумерованный список описаний */
  const descriptions = batch
    .map((job, idx) => {
      const text = (job.description || job.title || '').substring(0, 1500);
      return `--- Вакансия ${idx + 1} ---\n${text}`;
    })
    .join('\n\n');

  const prompt = `Ты — эксперт по IT-навыкам. Проанализируй описания ${batch.length} вакансий ниже.
Для КАЖДОЙ вакансии извлеки список IT-навыков (технологии, языки программирования, фреймворки, инструменты).

ПРАВИЛА:
- Возвращай ТОЛЬКО JSON-массив массивов, без пояснений.
- Каждый внутренний массив = навыки одной вакансии.
- Навыки должны быть краткими (1-2 слова): "React", "Node.js", "PostgreSQL", "Docker".
- Если навыки не найдены — верни пустой массив [].
- Количество внутренних массивов ДОЛЖНО быть ровно ${batch.length}.

ОПИСАНИЯ ВАКАНСИЙ:
${descriptions}

ОТВЕТ (только JSON):`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    },
    { timeout: 30000 }
  );

  /** Извлекаем текст ответа из вложенной структуры Gemini API */
  const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  /** Пытаемся распарсить JSON из ответа (ИИ может обернуть в ```json ... ```) */
  const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);

    /** Проверяем, что вернулся массив массивов */
    if (Array.isArray(parsed) && parsed.every(Array.isArray)) {
      return parsed;
    }

    /** Если вернулся плоский массив — оборачиваем */
    if (Array.isArray(parsed)) {
      return [parsed];
    }

    console.warn('[AI] ⚠️ Неожиданный формат ответа Gemini. Пропускаю навыки.');
    return batch.map(() => []);
  } catch (parseError) {
    console.error('[AI] ❌ Ошибка парсинга JSON от Gemini:', parseError.message);
    console.error('[AI] 📝 Сырой ответ:', rawText.substring(0, 300));
    return batch.map(() => []);
  }
}

/**
 * Разбивает массив на батчи (подмассивы) указанного размера.
 * @param {Array} array — Исходный массив.
 * @param {number} size — Размер одного батча.
 * @returns {Array<Array>} — Массив батчей.
 */
function splitIntoBatches(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}

/**
 * Промис-обёртка над setTimeout для асинхронных пауз.
 * @param {number} ms — Время ожидания в миллисекундах.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  extractSkillsFromJobs,
};
