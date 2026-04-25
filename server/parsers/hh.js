/**
 * @file hh.js — Парсер вакансий с HeadHunter (hh.ru).
 * @description Рефакторинг с использованием ООП и BaseParser.
 */

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const BaseParser = require('./base');

const HH_API_BASE = 'https://api.hh.ru';
const PAGE_DELAY_MS = 500;
const DEEP_SCRAPE_DELAY_MS = 500;

class HhParser extends BaseParser {
  constructor(area = 113) {
    super('HH.ru');
    this.area = area;
  }

  async parse(query, filters = {}) {
    const limit = filters.limit || 50;
    const period = this.mapPeriodToDays(filters.period);
    const perPage = 20;
    const maxPages = this.MAX_PAGES_TO_SCAN;

    console.log(`[Parser:HH] 🔍 Поиск: "${query}", период: ${period} дн., лимит: ${limit}`);

    const allJobs = [];
    // Компилируем стоп-слова ОДИН РАЗ до начала цикла
    const stopRegexes = this.compileStopWords(filters.stopWords || '');

    for (let page = 0; page < maxPages; page++) {
      console.log(`[Parser:HH] 📄 Загрузка страницы ${page + 1}/${maxPages}...`);

      try {
        const axiosConfig = {
          params: {
            text: query,
            period: period,
            per_page: perPage,
            page: page,
            area: this.area,
            only_with_salary: false,
          },
          headers: {
            'User-Agent': 'JobMarketAnalyzer/1.0',
            'HH-User-Agent': 'JobMarketAnalyzer/1.0',
            'Accept': 'application/json'
          },
          timeout: 15000,
        };

        if (process.env.RU_PROXY) {
          axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.RU_PROXY);
        }

        const response = await axios.get(`${HH_API_BASE}/vacancies`, axiosConfig);

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

        // Пауза перед следующей страницей
        if (page < maxPages - 1) {
          await this.delay(PAGE_DELAY_MS);
        }
      } catch (error) {
        if (error.response && error.response.status === 403) {
          console.warn(`[Parser:HH] 🛑 Бан по IP или User-Agent от Cloudflare. Нужен RU-прокси или валидный токен.`);
          break;
        }
        throw new Error(`HH API ошибка: ${error.message}`);
      }
    }

    // Если включен deepScrape, получаем полные описания
    if (filters.deepScrape && allJobs.length > 0) {
      console.log(`[Parser:HH] 🕵️ Начинается глубокий парсинг для ${allJobs.length} вакансий...`);
      await this.fetchDeepDescriptions(allJobs);
    }

    console.log(`[Parser:HH] ✅ Итого собрано: ${allJobs.length} вакансий`);
    return allJobs;
  }

  async fetchDeepDescriptions(jobs) {
    const fetchFn = async (job) => {
      try {
        await this.delay(DEEP_SCRAPE_DELAY_MS); // Пауза перед запросом
        
        const axiosConfig = {
          headers: {
            'User-Agent': 'JobMarketAnalyzer/1.0',
            'HH-User-Agent': 'JobMarketAnalyzer/1.0',
            'Accept': 'application/json'
          },
          timeout: 10000,
        };
        if (process.env.RU_PROXY) {
          axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.RU_PROXY);
        }

        const response = await axios.get(`${HH_API_BASE}/vacancies/${job.sourceId}`, axiosConfig);
        const fullVacancy = response.data;
        
        // Заменяем короткое описание на полное (без HTML тегов)
        if (fullVacancy.description) {
          // Простая очистка HTML
          job.description = fullVacancy.description.replace(/<[^>]*>?/gm, '\n').replace(/\n\s*\n/g, '\n').trim();
        }
        
        // Добавляем скиллы, если они есть в полном ответе
        if (fullVacancy.key_skills && Array.isArray(fullVacancy.key_skills)) {
          fullVacancy.key_skills.forEach(sk => {
            if (sk.name && !job.skills.includes(sk.name)) {
              job.skills.push(sk.name);
            }
          });
        }
        
      } catch (error) {
        console.warn(`[Parser:HH] ⚠️ Ошибка глубокого парсинга для ${job.sourceId}: ${error.message}. Fallback на snippet.`);
        job.deepScrapeFailed = true;
      }
    };

    // Ограничение параллелизма до 3 одновременных запросов
    await this.fetchDeepWithConcurrency(jobs, fetchFn, 3);
  }

  normalizeVacancy(vacancy) {
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

  mapHHCurrency(hhCurrency) {
    const currencyMap = {
      RUR: 'RUB', RUB: 'RUB', USD: 'USD', EUR: 'EUR',
      BYR: 'BYN', BYN: 'BYN', KZT: 'KZT', UAH: 'UAH',
      UZS: 'UZS', GEL: 'GEL', AZN: 'AZN', KGS: 'KGS',
    };
    return currencyMap[hhCurrency] || hhCurrency || 'RUB';
  }

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
