/**
 * @file hh.js — Парсер вакансий с HeadHunter (hh.ru).
 * @description Использует публичный API HeadHunter для получения вакансий.
 *              API документация: https://api.hh.ru/openapi/redoc
 *              Не требует авторизации для базовых запросов.
 */

const axios = require('axios');

/** Базовый URL API HeadHunter */
const HH_API_BASE = 'https://api.hh.ru';

/** Задержка между запросами страниц (мс) — вежливый парсинг */
const PAGE_DELAY_MS = 500;

/**
 * Парсит вакансии с HH.ru по заданным параметрам.
 *
 * @param {string} query — Поисковый запрос (например: "Frontend разработчик").
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

  console.log(`[Parser:HH] 🔍 Поиск: "${query}", период: ${period} дн., лимит: ${limit}`);

  const allJobs = [];

  for (let page = 0; page < maxPages; page++) {
    console.log(`[Parser:HH] 📄 Загрузка страницы ${page + 1}/${maxPages}...`);

    try {
      const response = await axios.get(`${HH_API_BASE}/vacancies`, {
        params: {
          text: query,
          period: period,
          per_page: perPage,
          page: page,
          area: 113, // Россия
          only_with_salary: false,
        },
        headers: {
          'User-Agent': 'WorkAnalytics/1.0 (student-project@example.com)',
        },
        timeout: 15000,
      });

      const vacancies = response.data.items || [];
      console.log(`[Parser:HH] 📊 Страница ${page + 1}: найдено ${vacancies.length} вакансий`);

      if (vacancies.length === 0) break;

      /** Преобразуем каждую вакансию в унифицированный формат */
      for (const vacancy of vacancies) {
        allJobs.push(normalizeHHVacancy(vacancy));
        if (allJobs.length >= limit) break;
      }

      if (allJobs.length >= limit) break;

      /** Пауза между запросами */
      if (page < maxPages - 1) {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      }
    } catch (error) {
      /** Если страница не загрузилась — пропускаем и переходим к следующей */
      if (error.response && error.response.status === 403) {
        console.warn(`[Parser:HH] ⚠️ Доступ к странице ${page + 1} заблокирован (403). Прерываю.`);
        break;
      }
      throw new Error(`HH API ошибка: ${error.message}`);
    }
  }

  console.log(`[Parser:HH] ✅ Итого собрано: ${allJobs.length} вакансий`);
  return allJobs;
}

/**
 * Преобразует вакансию из формата HH API в унифицированный формат приложения.
 *
 * @param {Object} vacancy — Сырой объект вакансии из HH API.
 * @returns {Object} — Вакансия в унифицированном формате.
 */
function normalizeHHVacancy(vacancy) {
  const salary = vacancy.salary || {};

  const workFormat = (vacancy.schedule?.id === 'remote') ? 'Remote' : 'Office';
  let city = vacancy.area?.name || 'Не указан';
  if (workFormat === 'Remote' || city === 'Не указан' || city === 'Россия') {
    city = 'Онлайн';
  }

  return {
    source: 'hh',
    sourceId: vacancy.id,
    title: vacancy.name || 'Без названия',
    company: vacancy.employer?.name || 'Не указана',
    city: city,
    url: vacancy.alternate_url || '',
    salary: {
      min: salary.from || null,
      max: salary.to || null,
      currency: mapHHCurrency(salary.currency),
    },
    experience: vacancy.experience?.name || 'Не указан',
    employment: vacancy.employment?.name || 'Не указан',
    workFormat: workFormat,
    description: vacancy.snippet?.requirement || vacancy.snippet?.responsibility || '',
    publishedAt: vacancy.published_at || '',
    skills: [], // Будут заполнены через Gemini AI
  };
}

/**
 * Конвертирует код валюты HH API в стандартный ISO-код.
 * HH использует нестандартные коды (RUR вместо RUB, BYR вместо BYN).
 *
 * @param {string} hhCurrency — Код валюты из HH API.
 * @returns {string} — ISO-код валюты.
 */
function mapHHCurrency(hhCurrency) {
  const currencyMap = {
    RUR: 'RUB',
    RUB: 'RUB',
    USD: 'USD',
    EUR: 'EUR',
    BYR: 'BYN',
    BYN: 'BYN',
    KZT: 'KZT',
    UAH: 'UAH',
    UZS: 'UZS',
    GEL: 'GEL',
    AZN: 'AZN',
    KGS: 'KGS',
  };
  return currencyMap[hhCurrency] || hhCurrency || 'RUB';
}

/**
 * Преобразует строковый период в число дней для API HeadHunter.
 *
 * @param {string} period — Период в текстовом формате ("1day", "3days", "7days", "30days").
 * @returns {number} — Количество дней.
 */
function mapPeriodToDays(period) {
  const periodMap = {
    '1day': 1,
    '3days': 3,
    '7days': 7,
    '14days': 14,
    '30days': 30,
  };
  return periodMap[period] || 7;
}

module.exports = { parse };
