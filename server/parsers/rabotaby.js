/**
 * @file rabotaby.js — Парсер вакансий с Rabota.by.
 * @description Использует публичный API HeadHunter (Rabota.by является частью HH Group).
 *              Работает аналогично парсеру HH, но ищет вакансии в регионе Беларусь (area=16).
 *              API совместим с HH.ru, различие только в параметре area.
 */

const axios = require('axios');

/** Базовый URL API (тот же HH API, но с фильтром по Беларуси) */
const API_BASE = 'https://api.hh.ru';

/** Задержка между запросами страниц (мс) */
const PAGE_DELAY_MS = 500;

/**
 * Парсит вакансии с Rabota.by (через HH API, area=16 — Беларусь).
 *
 * @param {string} query — Поисковый запрос.
 * @param {Object} filters — Фильтры поиска.
 * @param {string} [filters.period="7days"] — Период публикации.
 * @param {number} [filters.limit=50] — Максимальное количество вакансий.
 * @returns {Promise<Array<Object>>} — Массив вакансий в унифицированном формате.
 *
 * @throws {Error} — При критической ошибке сети или API.
 */
async function parse(query, filters = {}) {
  const limit = filters.limit || 50;
  const period = mapPeriodToDays(filters.period);
  const perPage = 20;
  const maxPages = Math.ceil(limit / perPage);

  console.log(`[Parser:Rabotaby] 🔍 Поиск: "${query}", период: ${period} дн., лимит: ${limit}`);

  const allJobs = [];

  for (let page = 0; page < maxPages; page++) {
    console.log(`[Parser:Rabotaby] 📄 Загрузка страницы ${page + 1}/${maxPages}...`);

    try {
      const response = await axios.get(`${API_BASE}/vacancies`, {
        params: {
          text: query,
          period: period,
          per_page: perPage,
          page: page,
          area: 16, // Беларусь (Rabota.by)
          only_with_salary: false,
        },
        headers: {
          'User-Agent': 'WorkAnalytics/1.0 (student-project)',
        },
        timeout: 15000,
      });

      const vacancies = response.data.items || [];
      console.log(`[Parser:Rabotaby] 📊 Страница ${page + 1}: найдено ${vacancies.length} вакансий`);

      if (vacancies.length === 0) break;

      /** Преобразуем каждую вакансию в унифицированный формат */
      for (const vacancy of vacancies) {
        allJobs.push(normalizeVacancy(vacancy));
        if (allJobs.length >= limit) break;
      }

      if (allJobs.length >= limit) break;

      /** Пауза между запросами */
      if (page < maxPages - 1) {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      }
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.warn(`[Parser:Rabotaby] ⚠️ Доступ заблокирован (403). Прерываю.`);
        break;
      }
      throw new Error(`Rabota.by API ошибка: ${error.message}`);
    }
  }

  console.log(`[Parser:Rabotaby] ✅ Итого собрано: ${allJobs.length} вакансий`);
  return allJobs;
}

/**
 * Преобразует вакансию из формата HH API в унифицированный формат.
 * Помечает source как "rabotaby" (чтобы отличать от основного HH).
 *
 * @param {Object} vacancy — Сырой объект вакансии из API.
 * @returns {Object} — Вакансия в унифицированном формате.
 */
function normalizeVacancy(vacancy) {
  const salary = vacancy.salary || {};

  return {
    source: 'rabotaby',
    sourceId: vacancy.id,
    title: vacancy.name || 'Без названия',
    company: vacancy.employer?.name || 'Не указана',
    city: vacancy.area?.name || 'Не указан',
    url: vacancy.alternate_url || '',
    salary: {
      min: salary.from || null,
      max: salary.to || null,
      currency: mapCurrency(salary.currency),
    },
    experience: vacancy.experience?.name || 'Не указан',
    employment: vacancy.employment?.name || 'Не указан',
    workFormat: (vacancy.schedule?.id === 'remote') ? 'Remote' : 'Office',
    description: vacancy.snippet?.requirement || vacancy.snippet?.responsibility || '',
    publishedAt: vacancy.published_at || '',
    skills: [],
  };
}

/**
 * Конвертирует нестандартные коды валют HH API в ISO-коды.
 * @param {string} currency — Код валюты из API.
 * @returns {string} — ISO-код валюты.
 */
function mapCurrency(currency) {
  const map = {
    RUR: 'RUB', RUB: 'RUB',
    USD: 'USD', EUR: 'EUR',
    BYR: 'BYN', BYN: 'BYN',
    KZT: 'KZT', UAH: 'UAH',
  };
  return map[currency] || currency || 'BYN';
}

/**
 * Преобразует строку периода в число дней.
 * @param {string} period — Период.
 * @returns {number} — Количество дней.
 */
function mapPeriodToDays(period) {
  const map = {
    '1day': 1, '3days': 3, '7days': 7, '14days': 14, '30days': 30,
  };
  return map[period] || 7;
}

module.exports = { parse };
