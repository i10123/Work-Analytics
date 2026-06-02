const axios = require('axios');
const BaseParser = require('./base');

const HH_API_BASE = 'https://api.hh.ru';

const USER_AGENTS = [
  'WorkAnalyticsApp/1.0 (work-analytics-support@gmail.com)',
  'JobMarketAnalyzer/1.1 (jobmarket.analyzer@mail.ru)',
  'VacancyTracker/2.0 (vacancy.tracker@yandex.ru)',
  'HRDataCollector/1.3 (hr.data.collector@gmail.com)',
  'CareerInsights/1.0 (career.insights.app@outlook.com)',
];

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

let sharedToken = null;
let sharedTokenExpiresAt = null;
let sharedTokenPromise = null;

class HhParser extends BaseParser {
  constructor(area = 113) {
    super('HH.ru');
    this.area = area;
    this._uaIndex = 0;
  }

  // Ротация User-Agent заголовков
  _getNextUserAgent() {
    const ua = USER_AGENTS[this._uaIndex % USER_AGENTS.length];
    this._uaIndex++;
    return ua;
  }

  // Получение и кэширование OAuth2 access_token
  getAccessToken() {
    const clientId = process.env.HH_CLIENT_ID;
    const clientSecret = process.env.HH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return Promise.resolve(null);
    }

    if (sharedToken && sharedTokenExpiresAt && Date.now() < sharedTokenExpiresAt) {
      return Promise.resolve(sharedToken);
    }

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
        const expiresInMs = (response.data.expires_in || 1209600) * 1000;
        sharedTokenExpiresAt = Date.now() + expiresInMs - 60000;

        console.log(`[Parser:HH] ✅ Токен получен, истекает через ${Math.round(expiresInMs / 3600000)} ч.`);
        return sharedToken;
      } catch (error) {
        const errDesc = error.response?.data?.error_description || error.response?.data?.error || error.message;
        console.warn(`[Parser:HH] ⚠️ Не удалось получить токен: ${errDesc}. Работаем анонимно.`);
        sharedToken = null;
        sharedTokenExpiresAt = null;
        return null;
      } finally {
        sharedTokenPromise = null;
      }
    })();

    return sharedTokenPromise;
  }

  // Генерация случайной задержки (jitter)
  _getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Формирование заголовков запроса
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

  // Запрос к API с повторными попытками (retry)
  async _requestWithRetry(url, params, token, cancelFlag) {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const config = {
          params,
          headers: this._buildHeaders(token),
          timeout: 15000,
        };

        if (cancelFlag?.abortController?.signal) {
          config.signal = cancelFlag.abortController.signal;
        }

        return await axios.get(url, config);
      } catch (error) {
        const status = error.response?.status;
        lastError = error;

        if (status === 403 || status === 429) {
          const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(
            `[Parser:HH] ⚠️ Получен HTTP ${status} (попытка ${attempt + 1}/${MAX_RETRIES}). ` +
            `Ждём ${backoffMs}мс...`
          );

          await this.delay(backoffMs, cancelFlag);
          continue;
        }

        const responseData = error.response?.data;
        if (error.response && responseData) {
          const detail = typeof responseData === 'object'
            ? JSON.stringify(responseData)
            : String(responseData).substring(0, 200);
          throw new Error(`HH API ошибка (HTTP ${status}): ${detail}`);
        }

        throw error;
      }
    }

    throw lastError || new Error('Все попытки запроса исчерпаны');
  }

  // Главный метод парсинга вакансий
  async parse(query, filters = {}, cancelFlag = null) {
    const limit = filters.limit || 50;
    const period = this.mapPeriodToDays(filters.period);
    const perPage = 20;
    let maxPages = this.MAX_PAGES_TO_SCAN;

    console.log(`[Parser:HH] 🔍 Поиск: "${query}", период: ${period} дн., лимит: ${limit}`);

    const token = await this.getAccessToken();
    if (token) {
      console.log(`[Parser:HH] 🔒 Используем авторизованный режим (Bearer token).`);
    } else {
      console.log(`[Parser:HH] 🔓 Работаем в анонимном режиме (без токена).`);
    }

    const allJobs = [];
    const stopRegexes = this.compileStopWords(filters.stopWords || '');

    for (let page = 0; page < maxPages; page++) {
      if (cancelFlag?.isStopped) {
        console.log(`[Parser:HH] 🛑 Задача остановлена. Прерываем парсинг.`);
        break;
      }

      console.log(`[Parser:HH] 📄 Загрузка страницы ${page + 1}/${maxPages}...`);

      try {
        const params = {
          text: query,
          period: period,
          per_page: perPage,
          page: page,
          area: this.area,
        };

        const response = await this._requestWithRetry(`${HH_API_BASE}/vacancies`, params, token, cancelFlag);

        if (page === 0 && response.data.pages) {
          if (response.data.pages < maxPages) {
            maxPages = response.data.pages;
            console.log(`[Parser:HH] 📄 Обновлен лимит страниц из API: ${maxPages}`);
          }
        }

        const vacancies = response.data.items || [];
        console.log(`[Parser:HH] 📊 Страница ${page + 1}: получено ${vacancies.length} вакансий (до фильтрации)`);

        if (vacancies.length === 0) {
          console.log(`[Parser:HH] Вакансии закончились.`);
          break;
        }

        let addedThisPage = 0;

        for (const vacancy of vacancies) {
          if (this.hasStopWords(vacancy.name, stopRegexes)) {
            continue;
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

        if (page < maxPages - 1) {
          const pageDelay = this._getRandomDelay(700, 1500);
          console.log(`[Parser:HH] ⏳ Пауза ${pageDelay}мс перед следующей страницей...`);
          await this.delay(pageDelay, cancelFlag);
        }
      } catch (error) {
        if (cancelFlag?.isStopped || error.name === 'AbortError' || error.code === 'ERR_CANCELED' || error.message.includes('canceled') || error.message.includes('abort')) {
          console.log(`[Parser:HH] 🛑 Запрос прерван. Прерываем парсинг и сохраняем собранные данные.`);
          break;
        }
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

    if (filters.deepScrape && allJobs.length > 0 && !cancelFlag?.isStopped) {
      console.log(`[Parser:HH] 🕵️ Начинается глубокий парсинг для ${allJobs.length} вакансий...`);
      await this.fetchDeepDescriptions(allJobs, token, cancelFlag);
    }

    console.log(`[Parser:HH] ✅ Итого собрано: ${allJobs.length} вакансий`);
    return allJobs;
  }

  // Глубокий сбор детальных описаний и навыков
  async fetchDeepDescriptions(jobs, token = null, cancelFlag = null) {
    const fetchFn = async (job) => {
      if (cancelFlag?.isStopped) return;

      try {
        const deepDelay = this._getRandomDelay(1000, 2000);
        await this.delay(deepDelay, cancelFlag);

        const response = await this._requestWithRetry(
          `${HH_API_BASE}/vacancies/${job.sourceId}`,
          {},
          token,
          cancelFlag
        );
        const fullVacancy = response.data;

        if (fullVacancy.description) {
          job.description = fullVacancy.description
            .replace(/<[^>]*>?/gm, '\n')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        }

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

    await this.fetchDeepWithConcurrency(jobs, fetchFn, 3, cancelFlag);
  }

  // Нормализация данных вакансии
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
        currency: this.mapCurrency(salary.currency, 'RUB'),
      },
      experience: vacancy.experience?.name || 'Не указан',
      employment: vacancy.employment?.name || 'Не указан',
      workFormat: workFormat,
      description: vacancy.snippet?.requirement || vacancy.snippet?.responsibility || '',
      publishedAt: vacancy.published_at || '',
      skills: [],
    };
  }

  // Преобразование периода поиска в дни
  mapPeriodToDays(period) {
    const periodMap = {
      '1day': 1, '3days': 3, '7days': 7, '30days': 30,
    };
    return periodMap[period] || 7;
  }
}

const parser = new HhParser();
module.exports = { parse: parser.parse.bind(parser), HhParser };