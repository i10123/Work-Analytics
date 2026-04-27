/**
 * @file hh.js — Парсер вакансий с HeadHunter (hh.ru).
 * @description Рефакторинг с многоуровневой защитой от блокировок:
 *   1. Ротация User-Agent с email (по правилам API HH.ru)
 *   2. OAuth2 авторизация (client_credentials) с кэшированием токена
 *   3. Ротация прокси + экспоненциальный backoff при 403/429
 *   4. Рандомизация задержек (human-like behavior)
 */

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const BaseParser = require('./base');

const HH_API_BASE = 'https://api.hh.ru';

/**
 * Массив User-Agent заголовков, соответствующих требованиям API HH.ru.
 * По правилам API HH.ru, заголовок должен содержать имя приложения и email.
 * @see https://github.com/hhru/api/blob/master/docs/general.md
 */
const USER_AGENTS = [
  'WorkAnalyticsApp/1.0 (work-analytics-support@gmail.com)',
  'JobMarketAnalyzer/1.1 (jobmarket.analyzer@mail.ru)',
  'VacancyTracker/2.0 (vacancy.tracker@yandex.ru)',
  'HRDataCollector/1.3 (hr.data.collector@gmail.com)',
  'CareerInsights/1.0 (career.insights.app@outlook.com)',
];

/**
 * Максимальное число попыток повторного запроса при 403/429.
 */
const MAX_RETRIES = 3;

/**
 * Базовая задержка (мс) для экспоненциального backoff.
 */
const BASE_BACKOFF_MS = 2000;

let sharedToken = null;
let sharedTokenExpiresAt = null;
let sharedTokenPromise = null;

class HhParser extends BaseParser {
  /**
   * @param {number} area — ID региона HH.ru (113 = Россия, 16 = Беларусь).
   */
  constructor(area = 113) {
    super('HH.ru');
    this.area = area;

    /** @type {number} — Текущий индекс User-Agent для ротации */
    this._uaIndex = 0;

    /** @type {string[]} — Массив прокси-серверов из env */
    this._proxies = this._parseProxies();

    /** @type {number} — Текущий индекс прокси для ротации */
    this._proxyIndex = 0;
  }

  // ────────────────────────────────────────────────
  //  1. РОТАЦИЯ USER-AGENT
  // ────────────────────────────────────────────────

  /**
   * Возвращает следующий User-Agent из массива (round-robin).
   * @returns {string}
   */
  _getNextUserAgent() {
    const ua = USER_AGENTS[this._uaIndex % USER_AGENTS.length];
    this._uaIndex++;
    return ua;
  }

  // ────────────────────────────────────────────────
  //  2. OAUTH2 АВТОРИЗАЦИЯ (client_credentials)
  // ────────────────────────────────────────────────

  /**
   * Получает OAuth2 access_token по схеме client_credentials.
   * Токен кэшируется в памяти до истечения его срока жизни.
   *
   * Если переменные окружения HH_CLIENT_ID и HH_CLIENT_SECRET не заданы,
   * возвращает null — парсер продолжает работу анонимно.
   *
   * @returns {Promise<string|null>} — Bearer-токен или null
   */
  async getAccessToken() {
    const clientId = process.env.HH_CLIENT_ID;
    const clientSecret = process.env.HH_CLIENT_SECRET;

    // Если ключей нет — работаем анонимно
    if (!clientId || !clientSecret) {
      return null;
    }

    // Если токен ещё жив — возвращаем из кэша
    if (sharedToken && sharedTokenExpiresAt && Date.now() < sharedTokenExpiresAt) {
      return sharedToken;
    }

    // Если токен уже запрашивается другим потоком/экземпляром — ждем
    if (sharedTokenPromise) {
      return sharedTokenPromise;
    }

    sharedTokenPromise = (async () => {
      console.log(`[Parser:HH] 🔑 Запрос нового OAuth2 access_token...`);

      try {
        const response = await axios.post(
          `${HH_API_BASE}/token`,
          new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
          }
        );

        sharedToken = response.data.access_token;

        // expires_in приходит в секундах, вычитаем 60 сек для безопасности
        const expiresInMs = (response.data.expires_in || 1209600) * 1000;
        sharedTokenExpiresAt = Date.now() + expiresInMs - 60000;

        console.log(`[Parser:HH] ✅ Токен получен, истекает через ${Math.round(expiresInMs / 3600000)} ч.`);
        return sharedToken;
      } catch (error) {
        console.warn(`[Parser:HH] ⚠️ Не удалось получить токен: ${error.message}. Работаем анонимно.`);
        sharedToken = null;
        sharedTokenExpiresAt = null;
        return null;
      } finally {
        sharedTokenPromise = null;
      }
    })();

    return sharedTokenPromise;
  }

  // ────────────────────────────────────────────────
  //  3. РОТАЦИЯ ПРОКСИ
  // ────────────────────────────────────────────────

  /**
   * Парсит строку прокси из env в массив.
   * Формат: "http://user:pass@ip1:port, http://user:pass@ip2:port"
   * @returns {string[]}
   */
  _parseProxies() {
    const raw = process.env.RU_PROXY;
    if (!raw) return [];
    return raw.split(',').map(p => p.trim()).filter(Boolean);
  }

  /**
   * Возвращает HttpsProxyAgent для текущего прокси.
   * @returns {import('https-proxy-agent').HttpsProxyAgent|undefined}
   */
  _getCurrentProxyAgent() {
    if (this._proxies.length === 0) return undefined;
    return new HttpsProxyAgent(this._proxies[this._proxyIndex % this._proxies.length]);
  }

  /**
   * Переключает на следующий прокси из списка.
   */
  _rotateProxy() {
    if (this._proxies.length <= 1) return;
    const oldIndex = this._proxyIndex % this._proxies.length;
    this._proxyIndex++;
    const newIndex = this._proxyIndex % this._proxies.length;
    console.log(`[Parser:HH] 🔄 Ротация прокси: #${oldIndex} → #${newIndex}`);
  }

  // ────────────────────────────────────────────────
  //  4. РАНДОМИЗАЦИЯ ЗАДЕРЖЕК
  // ────────────────────────────────────────────────

  /**
   * Генерирует случайную задержку в заданном диапазоне.
   * @param {number} min — Минимальная задержка (мс).
   * @param {number} max — Максимальная задержка (мс).
   * @returns {number}
   */
  _getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ────────────────────────────────────────────────
  //  5. ФОРМИРОВАНИЕ ЗАГОЛОВКОВ
  // ────────────────────────────────────────────────

  /**
   * Формирует заголовки запроса с ротацией UA и опциональным Bearer-токеном.
   * @param {string|null} token — OAuth2 access_token или null.
   * @returns {object}
   */
  _buildHeaders(token) {
    const ua = this._getNextUserAgent();
    const headers = {
      'User-Agent': ua,
      'HH-User-Agent': ua,
      'Accept': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  // ────────────────────────────────────────────────
  //  6. ЗАПРОС С РЕТРАЯМИ И BACKOFF
  // ────────────────────────────────────────────────

  /**
   * Выполняет HTTP GET запрос с поддержкой:
   *   - Ротации прокси при 403/429
   *   - Экспоненциального backoff (2с → 4с → 8с)
   *   - Ротации User-Agent при каждой повторной попытке
   *
   * @param {string} url — URL для запроса.
   * @param {object} params — Query-параметры.
   * @param {string|null} token — OAuth2 токен.
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async _requestWithRetry(url, params, token) {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const config = {
          params,
          headers: this._buildHeaders(token),
          timeout: 15000,
        };

        const agent = this._getCurrentProxyAgent();
        if (agent) {
          config.httpsAgent = agent;
          config.httpAgent = agent;
        }

        return await axios.get(url, config);
      } catch (error) {
        const status = error.response?.status;
        lastError = error;

        // Обрабатываем только 403 и 429 — для остальных ошибок прокидываем дальше
        if (status === 403 || status === 429) {
          const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt); // 2000 → 4000 → 8000
          console.warn(
            `[Parser:HH] ⚠️ Получен HTTP ${status} (попытка ${attempt + 1}/${MAX_RETRIES}). ` +
            `Ждём ${backoffMs}мс, затем ротация прокси...`
          );

          await this.delay(backoffMs);
          this._rotateProxy();
          // User-Agent тоже сменится автоматически при следующем _buildHeaders()
          continue;
        }

        // Другие ошибки — прокидываем сразу
        throw error;
      }
    }

    // Все попытки исчерпаны
    throw lastError || new Error('Все попытки запроса исчерпаны');
  }

  // ────────────────────────────────────────────────
  //  ОСНОВНОЙ МЕТОД ПАРСИНГА
  // ────────────────────────────────────────────────

  /**
   * Основной метод парсинга вакансий с hh.ru.
   *
   * @param {string} query — Поисковый запрос.
   * @param {object} filters — Фильтры (limit, period, stopWords, deepScrape).
   * @returns {Promise<object[]>} — Массив нормализованных вакансий.
   */
  async parse(query, filters = {}) {
    const limit = filters.limit || 50;
    const period = this.mapPeriodToDays(filters.period);
    const perPage = 20;
    const maxPages = this.MAX_PAGES_TO_SCAN;

    console.log(`[Parser:HH] 🔍 Поиск: "${query}", период: ${period} дн., лимит: ${limit}`);

    // Получаем OAuth2 токен (или null, если анонимный режим)
    const token = await this.getAccessToken();
    if (token) {
      console.log(`[Parser:HH] 🔒 Используем авторизованный режим (Bearer token).`);
    } else {
      console.log(`[Parser:HH] 🔓 Работаем в анонимном режиме (без токена).`);
    }

    const allJobs = [];
    // Компилируем стоп-слова ОДИН РАЗ до начала цикла
    const stopRegexes = this.compileStopWords(filters.stopWords || '');

    for (let page = 0; page < maxPages; page++) {
      console.log(`[Parser:HH] 📄 Загрузка страницы ${page + 1}/${maxPages}...`);

      try {
        const params = {
          text: query,
          period: period,
          per_page: perPage,
          page: page,
          area: this.area,
          only_with_salary: false,
        };

        // Запрос с ретраями, ротацией прокси и backoff
        const response = await this._requestWithRetry(`${HH_API_BASE}/vacancies`, params, token);

        const vacancies = response.data.items || [];
        console.log(`[Parser:HH] 📊 Страница ${page + 1}: получено ${vacancies.length} вакансий (до фильтрации)`);

        if (vacancies.length === 0) {
          console.log(`[Parser:HH] Вакансии закончились.`);
          break;
        }

        let addedThisPage = 0;

        for (const vacancy of vacancies) {
          // Проверка на стоп-слова (регулярки уже скомпилированы)
          if (this.hasStopWords(vacancy.name, stopRegexes)) {
            continue; // Пропускаем вакансию
          }

          allJobs.push(this.normalizeVacancy(vacancy));
          addedThisPage++;

          if (allJobs.length >= limit) break;
        }

        console.log(`[Parser:HH] 📊 Страница ${page + 1}: добавлено ${addedThisPage} валидных вакансий. Всего: ${allJobs.length}/${limit}`);

        if (allJobs.length >= limit) {
          console.log(`[Parser:HH] Достигнут лимит (${limit}). Остановка.`);
          break;
        }

        // Рандомизированная пауза перед следующей страницей (human-like)
        if (page < maxPages - 1) {
          const pageDelay = this._getRandomDelay(700, 1500);
          console.log(`[Parser:HH] ⏳ Пауза ${pageDelay}мс перед следующей страницей...`);
          await this.delay(pageDelay);
        }
      } catch (error) {
        // После всех ретраев — если всё равно 403/429, логируем и продолжаем к следующей странице
        const status = error.response?.status;
        if (status === 403 || status === 429) {
          console.warn(
            `[Parser:HH] 🛑 Не удалось загрузить страницу ${page + 1} после ${MAX_RETRIES} попыток (HTTP ${status}). ` +
            `Пропускаем и продолжаем...`
          );
          continue;
        }
        throw new Error(`HH API ошибка: ${error.message}`);
      }
    }

    // Если включен deepScrape, получаем полные описания
    if (filters.deepScrape && allJobs.length > 0) {
      console.log(`[Parser:HH] 🕵️ Начинается глубокий парсинг для ${allJobs.length} вакансий...`);
      await this.fetchDeepDescriptions(allJobs, token);
    }

    console.log(`[Parser:HH] ✅ Итого собрано: ${allJobs.length} вакансий`);
    return allJobs;
  }

  // ────────────────────────────────────────────────
  //  ГЛУБОКИЙ ПАРСИНГ (Deep Scrape)
  // ────────────────────────────────────────────────

  /**
   * Получает полные описания вакансий по их ID.
   * Использует ограничение параллелизма и ретраи.
   *
   * @param {object[]} jobs — Массив вакансий.
   * @param {string|null} token — OAuth2 токен.
   */
  async fetchDeepDescriptions(jobs, token = null) {
    const fetchFn = async (job) => {
      try {
        // Рандомизированная пауза перед запросом (human-like)
        const deepDelay = this._getRandomDelay(1000, 2000);
        await this.delay(deepDelay);

        const response = await this._requestWithRetry(
          `${HH_API_BASE}/vacancies/${job.sourceId}`,
          {},
          token
        );
        const fullVacancy = response.data;

        // Заменяем короткое описание на полное (без HTML тегов)
        if (fullVacancy.description) {
          // Простая очистка HTML
          job.description = fullVacancy.description
            .replace(/<[^>]*>?/gm, '\n')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        }

        // Добавляем скиллы, если они есть в полном ответе
        if (fullVacancy.key_skills && Array.isArray(fullVacancy.key_skills)) {
          fullVacancy.key_skills.forEach((sk) => {
            if (sk.name && !job.skills.includes(sk.name)) {
              job.skills.push(sk.name);
            }
          });
        }
      } catch (error) {
        console.warn(
          `[Parser:HH] ⚠️ Ошибка глубокого парсинга для ${job.sourceId}: ${error.message}. Fallback на snippet.`
        );
        job.deepScrapeFailed = true;
      }
    };

    // Ограничение параллелизма до 3 одновременных запросов
    await this.fetchDeepWithConcurrency(jobs, fetchFn, 3);
  }

  // ────────────────────────────────────────────────
  //  НОРМАЛИЗАЦИЯ ДАННЫХ
  // ────────────────────────────────────────────────

  /**
   * Нормализует сырую вакансию из API HH.ru в единый формат.
   * @param {object} vacancy — Объект вакансии из API.
   * @returns {object}
   */
  normalizeVacancy(vacancy) {
    const salary = vacancy.salary || {};

    const workFormat = vacancy.schedule?.id === 'remote' ? 'Remote' : 'Office';
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
        currency: this.mapHHCurrency(salary.currency),
      },
      experience: vacancy.experience?.name || 'Не указан',
      employment: vacancy.employment?.name || 'Не указан',
      workFormat: workFormat,
      description: vacancy.snippet?.requirement || vacancy.snippet?.responsibility || '',
      publishedAt: vacancy.published_at || '',
      skills: [],
    };
  }

  /**
   * Маппинг кодов валют HH.ru на стандартные ISO.
   * @param {string} hhCurrency
   * @returns {string}
   */
  mapHHCurrency(hhCurrency) {
    const currencyMap = {
      RUR: 'RUB', RUB: 'RUB', USD: 'USD', EUR: 'EUR',
      BYR: 'BYN', BYN: 'BYN', KZT: 'KZT', UAH: 'UAH',
      UZS: 'UZS', GEL: 'GEL', AZN: 'AZN', KGS: 'KGS',
    };
    return currencyMap[hhCurrency] || hhCurrency || 'RUB';
  }

  /**
   * Маппинг строковых периодов в числовые дни.
   * @param {string} period
   * @returns {number}
   */
  mapPeriodToDays(period) {
    const periodMap = {
      '1day': 1, '3days': 3, '7days': 7, '14days': 14, '30days': 30,
    };
    return periodMap[period] || 7;
  }
}

// Экспортируем инстанс для совместимости или функцию
const parser = new HhParser();
module.exports = { parse: parser.parse.bind(parser), HhParser };
