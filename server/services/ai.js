const { askBrowserAi } = require('./browserAiService');

const DEFAULT_METADATA = {
  skills: [],
  programmingLanguages: [],
  frameworksAndTools: [],
  softSkills: [],
  workFormat: 'Не указано',
  grade: 'Не указано',
  experience_years_min: null,
  experience_years_max: null,
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

const UNINFORMATIVE_VALUES = new Set(['Не указано']);

async function extractMetadataFromJobs(jobs, onProgress = null, isDeepScrape = false, cancelFlag = null) {
  if (!jobs || jobs.length === 0) return [];

  const batchSize = isDeepScrape ? 5 : 10;
  const batches = splitIntoBatches(jobs, batchSize);
  const enrichedJobs = [];

  console.log(`[AI] 🤖 Начинаю извлечение метаданных для ${jobs.length} вакансий (всего батчей: ${batches.length}) с помощью Browser AI...`);

  for (let i = 0; i < batches.length; i++) {
    if (cancelFlag && cancelFlag.isStopped) {
      console.log('[AI] 🛑 Извлечение метаданных отменено пользователем.');
      break;
    }

    const batch = batches[i];
    console.log(`[AI] 🌐 Обработка батча ${i + 1}/${batches.length}...`);

    if (onProgress) {
      onProgress(i, batches.length, `AI-анализ вакансий: обработка батча ${i + 1} из ${batches.length}...`);
    }

    let metadataMap = {};
    try {
      const prompt = generatePrompt(batch);
      const rawText = await askBrowserAi({ prompt, thinking: isDeepScrape });
      metadataMap = parseJsonFromAi(rawText, batch.length);
      console.log(`[AI] ✅ Батч ${i + 1}/${batches.length} успешно обработан.`);
    } catch (error) {
      console.error(`[AI] ❌ Ошибка при обработке батча ${i + 1}:`, error.message);
      if (cancelFlag && cancelFlag.isStopped) break;
      metadataMap = {};
    }

    for (let j = 0; j < batch.length; j++) {
      const aiData = metadataMap ? (metadataMap[String(j)] || {}) : {};
      enrichedJobs.push(mergeAiMetadata(batch[j], aiData));
    }

    if (onProgress) {
      onProgress(i + 1, batches.length);
    }
  }

  return enrichedJobs;
}

function getValidEnum(value, validList, defaultValue) {
  return validList.includes(value) ? value : defaultValue;
}

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
  const aiLanguages = sanitizeStringArray(aiData.programmingLanguages);
  const aiFrameworks = sanitizeStringArray(aiData.frameworksAndTools);

  const mergedSkillsMap = new Map();
  for (const s of jobSkills) mergedSkillsMap.set(s.toLowerCase(), s);
  for (const s of aiLanguages) mergedSkillsMap.set(s.toLowerCase(), s);
  for (const s of aiFrameworks) mergedSkillsMap.set(s.toLowerCase(), s);

  const mergedSkills = Array.from(mergedSkillsMap.values());
  const cleanSoftSkills = sanitizeStringArray(aiData.softSkills);
  const cleanLanguages = Array.from(new Set(aiLanguages));
  const cleanFrameworks = Array.from(new Set(aiFrameworks));

  const assignedGrade = getValidEnum(aiData.grade, VALID_EXPERIENCES, DEFAULT_METADATA.grade);

  return {
    ...job,
    skills: mergedSkills.length > 0 ? mergedSkills : DEFAULT_METADATA.skills,
    programmingLanguages: cleanLanguages.length > 0 ? cleanLanguages : DEFAULT_METADATA.programmingLanguages,
    frameworksAndTools: cleanFrameworks.length > 0 ? cleanFrameworks : DEFAULT_METADATA.frameworksAndTools,
    softSkills: cleanSoftSkills.length > 0 ? cleanSoftSkills : DEFAULT_METADATA.softSkills,
    workFormat: getValidEnumPreferJob(aiData.workFormat, job.workFormat, VALID_WORK_FORMATS, DEFAULT_METADATA.workFormat),
    grade: assignedGrade,
    experience_years_min: typeof aiData.experience_years_min === 'number' ? aiData.experience_years_min : DEFAULT_METADATA.experience_years_min,
    experience_years_max: typeof aiData.experience_years_max === 'number' ? aiData.experience_years_max : DEFAULT_METADATA.experience_years_max,
    experience: assignedGrade !== 'Не указано' ? assignedGrade : getValidEnumPreferJob(aiData.experience, job.experience, VALID_EXPERIENCES, DEFAULT_METADATA.experience),
    englishLevel: getValidEnum(aiData.englishLevel, VALID_ENGLISH_LEVELS, DEFAULT_METADATA.englishLevel),
    techCategory: getValidEnum(aiData.techCategory, VALID_TECH_CATEGORIES, DEFAULT_METADATA.techCategory),
    education: getValidEnum(aiData.education, VALID_EDUCATIONS, DEFAULT_METADATA.education),
  };
}

function generatePrompt(batch) {
  const payload = batch.map((job, idx) => ({
    id: String(idx),
    text: `${job.title || ''} | ${job.description || ''}`.trim()
  }));
  return `Проанализируй описания ${batch.length} вакансий. Для КАЖДОЙ извлеки структурированные метаданные.
ПРАВИЛА:
- Возвращай ТОЛЬКО JSON-объект, где ключи — это ID вакансии (строки "0", "1", ...).
- Каждое значение — объект со СЛЕДУЮЩИМИ 11 полями:
  1. "programmingLanguages": массив используемых языков программирования (например, ["JavaScript", "TypeScript"], ["Python"], ["Go"]). Только базовые языки, не фреймворки. Если нет — [].
  2. "frameworksAndTools": массив библиотек, фреймворков, СУБД, инструментов и DevOps-технологий (например, ["React", "Redux", "Docker", "PostgreSQL", "Git"]). Если нет — [].
  3. "softSkills": массив Soft Skills (личные качества, например, ["Коммуникабельность", "Работа в команде"]). Если нет — [].
  4. "workFormat": СТРОГО одно из: "Remote", "Office", "Hybrid", "Не указано".
  5. "grade": СТРОГО одно из: "Intern", "Junior", "Middle", "Senior", "Lead", "Не указано".
  6. "experience_years_min": МИНИМАЛЬНЫЙ требуемый опыт в годах (число, например 1). Если не указано — null.
  7. "experience_years_max": МАКСИМАЛЬНЫЙ требуемый опыт в годах (число, например 3). Если не указано — null.
  8. "experience": СТРОГО одно из: "Intern", "Junior", "Middle", "Senior", "Lead", "Не указано". (укажи такое же значение, как и в поле "grade").
  9. "englishLevel": СТРОГО одно из: "Нет", "A1", "A2", "B1", "B2", "C1", "C2", "Не указано".
  10. "techCategory": СТРОГО одно из: "Frontend", "Backend", "Fullstack", "QA", "DevOps", "Mobile", "Data Science", "Другое".
  11. "education": СТРОГО одно из: "Высшее", "Среднее", "Не требуется", "Не указано".
Пример ответа:
{
  "0": {
    "programmingLanguages": ["JavaScript", "TypeScript"],
    "frameworksAndTools": ["React", "Redux", "Next.js", "Jest", "Git"],
    "softSkills": ["Работа в команде", "Решение проблем"],
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
      throw new Error('JSON-объект не найден в ответе ИИ');
    }

    const jsonStr = rawText.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr);

    if (Object.keys(parsed).length === 0 && expectedLength > 0) {
      throw new Error('Распарсенный JSON пуст, ожидались данные');
    }

    console.log(`[AI] ✅ Успешно распарсен JSON-ответ от ИИ (извлечено объектов: ${Object.keys(parsed).length})`);
    return parsed;
  } catch (e) {
    console.error(`[AI] ❌ Ошибка валидации/парсинга JSON: ${e.message}`);
    console.error(`[AI] 📝 Сырой ответ ИИ: ${rawText.substring(0, 500)}...`);
    throw new Error(`Ошибка парсинга JSON от ИИ: ${e.message}`);
  }
}

function splitIntoBatches(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}

async function generateCandidateProfile(report, selectedSkills = [], cancelFlag = null) {
  if (selectedSkills && !Array.isArray(selectedSkills)) {
    cancelFlag = selectedSkills;
    selectedSkills = [];
  }

  const jobs = report.jobs || [];
  if (!jobs.length) return "Нет данных для анализа.";
  if (cancelFlag && cancelFlag.isStopped) return "Анализ отменён.";

  const safeQuery = report.query
    ? report.query.replace(/[\r\n"\\]/g, ' ').trim()
    : '';

  console.log(`[AI] ✨ Составление портрета идеального кандидата по запросу "${safeQuery}" на основе ${jobs.length} вакансий (выбранные навыки: ${selectedSkills.join(', ')})...`);

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

  let selectedSkillsPrompt = "";
  if (selectedSkills && selectedSkills.length > 0) {
    selectedSkillsPrompt = `
Кандидат указал, что обладает следующими навыками (стек пользователя): ${selectedSkills.join(', ')}.

Пожалуйста, добавь в портрет специальный обязательный раздел:
5. **Анализ соответствия кандидата (Job Matching)**:
   - Проанализируй, насколько стек кандидата (${selectedSkills.join(', ')}) соответствует топ востребованных навыков (${topSkills}) и требованиям рынка.
   - Оцени общую совместимость (например: Отличная, Средняя, Низкая) с подробным профессиональным обоснованием.
   - Дай точечные рекомендации: какие именно из востребованных на рынке навыков кандидату стоит изучить в первую очередь, чтобы повысить свою конкурентоспособность.
   - Предложи конкретные пути развития (какие фреймворки/инструменты подтянуть).
`;
  }

  const prompt = `Ты — экспертный IT-рекрутер и аналитик рынка труда.
Я собрал данные по вакансиям по запросу "${safeQuery}".
Всего вакансий: ${jobs.length}.
Топ востребованных навыков: ${topSkills}.
Самый частый формат работы: ${topFormat}.
Самый частый требуемый опыт: ${topExp}.
${selectedSkillsPrompt}
На основе этих данных, составь краткий и красивый "Портрет идеального кандидата" в формате Markdown.
Структура ответа должна включать:
1. **Резюме** — кто этот специалист на рынке сейчас.
2. **Ключевые компетенции** (Hard & Soft skills).
3. **Требования рынка** (ожидания по опыту и формату работы).
4. **Рекомендации кандидату** (на что сделать упор при поиске и развитию).
${selectedSkills && selectedSkills.length > 0 ? "5. **Анализ соответствия кандидата (Job Matching)** — степень применимости стека и векторы развития." : ""}

Пиши профессионально, ёмко, используй эмодзи и Markdown (жирный текст, списки). Не выводи никаких JSON, только красивый текст.`;

  return await generateTextFromAI(prompt, cancelFlag);
}

async function generateTextFromAI(prompt, cancelFlag = null) {
  if (cancelFlag && cancelFlag.isStopped) return "Анализ отменён.";

  try {
    console.log(`[AI] 🌐 Отправка запроса к Browser AI для генерации сводки...`);
    const response = await askBrowserAi({ prompt });
    return response || "Не удалось сгенерировать сводку.";
  } catch (error) {
    if (cancelFlag && cancelFlag.isStopped) return "Анализ отменён.";
    console.error(`[AI] ❌ Ошибка генерации сводки:`, error.message);
    return `Ошибка генерации сводки: ${error.message}`;
  }
}

module.exports = {
  extractMetadataFromJobs,
  generateCandidateProfile,
};