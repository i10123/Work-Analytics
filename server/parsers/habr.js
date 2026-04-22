/**
 * @file habr.js — Парсер вакансий с Хабр Карьеры.
 * @description Использует HTTP-парсинг HTML-страниц (cheerio) для сбора вакансий,
 *              так как у Хабр Карьеры нет публичного API.
 *              Реализованы защитные механизмы:
 *              - Рандомизированный User-Agent
 *              - Задержки 1-2 сек между запросами
 *              - Обработка captcha/block ответов
 */

const axios = require('axios');
const cheerio = require('cheerio');

/** Базовый URL Хабр Карьеры */
const HABR_BASE = 'https://career.habr.com';

/** Минимальная задержка между запросами (мс) */
const MIN_DELAY_MS = 1200;
/** Максимальная задержка между запросами (мс) */
const MAX_DELAY_MS = 2500;

/**
 * Список User-Agent строк для ротации.
 * Имитируем реальные браузеры, чтобы снизить вероятность блокировки.
 * @type {string[]}
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

/**
 * Парсит вакансии с Хабр Карьеры путём скрейпинга HTML-страниц.
 *
 * @param {string} query — Поисковый запрос (ключевое слово).
 * @param {Object} filters — Фильтры поиска.
 * @param {number} [filters.limit=50] — Максимальное количество вакансий.
 * @returns {Promise<Array<Object>>} — Массив вакансий в унифицированном формате.
 *
 * @throws {Error} — При блокировке IP или критической ошибке.
 */
async function parse(query, filters = {}) {
  const limit = filters.limit || 50;
  const maxPages = Math.ceil(limit / 25); // Хабр показывает ~25 вакансий на странице

  console.log(`[Parser:Habr] 🔍 Поиск: "${query}", лимит: ${limit}`);

  const allJobs = [];

  for (let page = 1; page <= maxPages; page++) {
    console.log(`[Parser:Habr] 📄 Загрузка страницы ${page}/${maxPages}...`);

    try {
      const url = `${HABR_BASE}/vacancies`;
      const response = await axios.get(url, {
        params: {
          q: query,
          page: page,
          type: 'all',
        },
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        timeout: 15000,
      });

      /** Проверка на блокировку/captcha */
      if (response.status === 429 || response.status === 403) {
        throw new Error(`Хабр заблокировал запросы (HTTP ${response.status})`);
      }

      const html = response.data;

      /** Парсим HTML с помощью cheerio */
      const jobs = parseHabrHTML(html);
      console.log(`[Parser:Habr] 📊 Страница ${page}: найдено ${jobs.length} вакансий`);

      if (jobs.length === 0) break;

      for (const job of jobs) {
        allJobs.push(job);
        if (allJobs.length >= limit) break;
      }

      if (allJobs.length >= limit) break;

      /** Рандомизированная задержка между запросами */
      if (page < maxPages) {
        const delay = getRandomDelay();
        console.log(`[Parser:Habr] ⏳ Пауза ${delay}мс перед следующей страницей...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (error) {
      /** Если получили блокировку — прерываем и выбрасываем ошибку для retry */
      if (error.response && (error.response.status === 429 || error.response.status === 403)) {
        throw new Error(`Хабр Карьера заблокировал запросы (HTTP ${error.response.status})`);
      }
      throw new Error(`Habr Career ошибка: ${error.message}`);
    }
  }

  console.log(`[Parser:Habr] ✅ Итого собрано: ${allJobs.length} вакансий`);
  return allJobs;
}

/**
 * Парсит HTML-страницу вакансий Хабр Карьеры с помощью cheerio.
 * Извлекает данные из карточек вакансий.
 *
 * @param {string} html — Сырой HTML-код страницы.
 * @returns {Array<Object>} — Массив вакансий в унифицированном формате.
 */
function parseHabrHTML(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  /** Основной селектор карточек вакансий на Хабр Карьере */
  $('.vacancy-card').each((_, element) => {
    try {
      const $card = $(element);

      /** Извлекаем основные поля из карточки */
      const title = $card.find('.vacancy-card__title a').text().trim() ||
                    $card.find('[class*="title"] a').text().trim();
      
      const url = $card.find('.vacancy-card__title a').attr('href') ||
                  $card.find('[class*="title"] a').attr('href') || '';
      
      const company = $card.find('.vacancy-card__company-title a').text().trim() ||
                      $card.find('[class*="company"] a').text().trim() || 'Не указана';

      /** Парсинг зарплаты */
      const salaryText = $card.find('.vacancy-card__salary, [class*="salary"]').text().trim();
      const salary = parseSalaryText(salaryText);

      /** Парсинг навыков (теги) */
      const skills = [];
      $card.find('.vacancy-card__skills .preserve-line, [class*="skill"]').each((_, skillEl) => {
        const skill = $(skillEl).text().trim();
        if (skill) skills.push(skill);
      });

      /** Описание (если есть) */
      const description = $card.find('.vacancy-card__description, [class*="snippet"]').text().trim();

      /** Метаданные */
      const city = $card.find('.vacancy-card__meta [class*="location"]').text().trim() || 'Не указан';

      if (title) {
        jobs.push({
          source: 'habr',
          sourceId: (url.match(/vacancies\/(\d+)/) || [])[1] || '',
          title,
          company,
          city,
          url: url.startsWith('http') ? url : `${HABR_BASE}${url}`,
          salary,
          experience: '',
          employment: '',
          workFormat: (city.toLowerCase().includes('удаленно') || city.toLowerCase().includes('удалённо') || skills.some(s => s.toLowerCase().includes('удален'))) ? 'Remote' : 'Office',
          description: description || title,
          publishedAt: '',
          skills, // Навыки из тегов Хабра (дополнительно обогащаются Gemini)
        });
      }
    } catch (err) {
      console.warn(`[Parser:Habr] ⚠️ Ошибка парсинга карточки: ${err.message}`);
    }
  });

  return jobs;
}

/**
 * Парсит текстовую строку зарплаты в структурированный объект.
 * Обрабатывает форматы: "от 100 000 ₽", "до 200 000 $", "100 000 – 200 000 ₽"
 *
 * @param {string} text — Строка с зарплатой.
 * @returns {Object} — { min, max, currency }
 */
function parseSalaryText(text) {
  if (!text) return { min: null, max: null, currency: 'RUB' };

  /** Определяем валюту */
  let currency = 'RUB';
  if (text.includes('$') || text.toLowerCase().includes('usd')) currency = 'USD';
  else if (text.includes('€') || text.toLowerCase().includes('eur')) currency = 'EUR';
  else if (text.toLowerCase().includes('byn') || text.toLowerCase().includes('бел')) currency = 'BYN';

  /** Извлекаем числа */
  const numbers = text.match(/[\d\s]+/g);
  if (!numbers) return { min: null, max: null, currency };

  const cleanedNumbers = numbers
    .map((n) => parseInt(n.replace(/\s/g, ''), 10))
    .filter((n) => !isNaN(n) && n > 0);

  if (cleanedNumbers.length === 0) return { min: null, max: null, currency };

  const hasFrom = text.toLowerCase().includes('от');
  const hasTo = text.toLowerCase().includes('до');

  if (cleanedNumbers.length >= 2) {
    return { min: cleanedNumbers[0], max: cleanedNumbers[1], currency };
  }
  if (hasFrom) {
    return { min: cleanedNumbers[0], max: null, currency };
  }
  if (hasTo) {
    return { min: null, max: cleanedNumbers[0], currency };
  }

  return { min: cleanedNumbers[0], max: cleanedNumbers[0], currency };
}

/**
 * Возвращает случайный User-Agent из списка.
 * @returns {string}
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Возвращает случайную задержку в диапазоне [MIN_DELAY_MS, MAX_DELAY_MS].
 * @returns {number} — Задержка в миллисекундах.
 */
function getRandomDelay() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

module.exports = { parse };
