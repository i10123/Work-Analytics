/**
 * @file habr.js — Парсер вакансий с Хабр Карьеры.
 * @description Рефакторинг с использованием ООП.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const BaseParser = require('./base');

const HABR_BASE = 'https://career.habr.com';
const MIN_DELAY_MS = 1200;
const MAX_DELAY_MS = 2500;
const DEEP_SCRAPE_DELAY_MS = 1500;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

class HabrParser extends BaseParser {
  constructor() {
    super('Хабр Карьера');
  }

  async parse(query, filters = {}) {
    const limit = filters.limit || 50;
    // Компилируем стоп-слова ОДИН РАЗ до начала цикла
    const stopRegexes = this.compileStopWords(filters.stopWords || '');
    
    // Хабр показывает ~25 вакансий на странице
    // Ограничиваем максимальное количество страниц
    const maxPages = this.MAX_PAGES_TO_SCAN;

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
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
          },
          timeout: 15000,
        });

        const html = response.data;
        const jobsOnPage = this.parseHabrHTML(html);
        console.log(`[Parser:Habr] 📊 Страница ${page}: получено ${jobsOnPage.length} вакансий (до фильтрации)`);

        if (jobsOnPage.length === 0) {
          console.log(`[Parser:Habr] Вакансии закончились.`);
          break;
        }

        let addedThisPage = 0;

        for (const job of jobsOnPage) {
          if (this.hasStopWords(job.title, stopRegexes)) {
            continue;
          }

          allJobs.push(job);
          addedThisPage++;

          if (allJobs.length >= limit) break;
        }

        console.log(`[Parser:Habr] 📊 Страница ${page}: добавлено ${addedThisPage} валидных вакансий. Всего: ${allJobs.length}/${limit}`);

        if (allJobs.length >= limit) {
          console.log(`[Parser:Habr] Достигнут лимит (${limit}). Остановка.`);
          break;
        }

        if (page < maxPages) {
          const delay = this.getRandomDelay();
          await this.delay(delay);
        }
      } catch (error) {
        if (error.response && (error.response.status === 429 || error.response.status === 403)) {
          throw new Error(`Хабр Карьера заблокировал запросы (HTTP ${error.response.status})`);
        }
        throw new Error(`Habr Career ошибка: ${error.message}`);
      }
    }

    if (filters.deepScrape && allJobs.length > 0) {
      console.log(`[Parser:Habr] 🕵️ Начинается глубокий парсинг для ${allJobs.length} вакансий...`);
      await this.fetchDeepDescriptions(allJobs);
    }

    console.log(`[Parser:Habr] ✅ Итого собрано: ${allJobs.length} вакансий`);
    return allJobs;
  }

  parseHabrHTML(html) {
    const $ = cheerio.load(html);
    const jobs = [];

    $('.vacancy-card').each((_, element) => {
      try {
        const $card = $(element);

        const title = $card.find('.vacancy-card__title a').text().trim() ||
                      $card.find('[class*="title"] a').text().trim();
        
        const url = $card.find('.vacancy-card__title a').attr('href') ||
                    $card.find('[class*="title"] a').attr('href') || '';
        
        const company = $card.find('.vacancy-card__company-title a').text().trim() ||
                        $card.find('[class*="company"] a').text().trim() || 'Не указана';

        const salaryText = $card.find('.vacancy-card__salary, [class*="salary"]').text().trim();
        const salary = this.parseSalaryText(salaryText);

        const skills = [];
        $card.find('.vacancy-card__skills .preserve-line, [class*="skill"]').each((_, skillEl) => {
          const skill = $(skillEl).text().trim();
          if (skill) skills.push(skill);
        });

        const description = $card.find('.vacancy-card__description, [class*="snippet"]').text().trim();

        const metaText = $card.find('.vacancy-card__meta').text();
        const city = $card.find('.vacancy-card__meta [class*="location"]').text().trim() || 'Не указан';
        
        const publishedAt = $card.find('time.basic-date').attr('datetime') || $card.find('time').attr('datetime') || '';
        
        let employment = '';
        if (metaText.includes('Полный рабочий день')) employment = 'Полная занятость';
        else if (metaText.includes('Неполный рабочий день')) employment = 'Частичная занятость';
        else if (metaText.includes('Проектная работа')) employment = 'Проектная работа';

        let experience = '';
        const lowerMeta = metaText.toLowerCase();
        if (lowerMeta.includes('стажер') || lowerMeta.includes('стажёр') || lowerMeta.includes('intern')) experience = 'Intern';
        else if (lowerMeta.includes('junior')) experience = 'Junior';
        else if (lowerMeta.includes('middle')) experience = 'Middle';
        else if (lowerMeta.includes('senior')) experience = 'Senior';
        else if (lowerMeta.includes('lead')) experience = 'Lead';

        let finalDescription = description;
        if (!finalDescription || finalDescription.length < 50) {
          const skillsText = skills.length > 0 ? `Ключевые навыки: ${skills.join(', ')}` : '';
          finalDescription = [title, finalDescription, skillsText].filter(Boolean).join('\n\n');
        }

        const workFormat = (city.toLowerCase().includes('удаленно') || city.toLowerCase().includes('удалённо') || skills.some(s => s.toLowerCase().includes('удален')) || lowerMeta.includes('можно удаленно') || lowerMeta.includes('удален')) ? 'Remote' : 'Office';

        if (title) {
          jobs.push({
            source: 'habr',
            sourceId: (url.match(/vacancies\/(\d+)/) || [])[1] || '',
            title,
            company,
            city,
            url: url.startsWith('http') ? url : `${HABR_BASE}${url}`,
            salary,
            experience,
            employment,
            workFormat,
            description: finalDescription,
            publishedAt,
            skills,
          });
        }
      } catch (err) {
        console.warn(`[Parser:Habr] ⚠️ Ошибка парсинга карточки: ${err.message}`);
      }
    });

    return jobs;
  }

  async fetchDeepDescriptions(jobs) {
    const fetchFn = async (job) => {
      try {
        await this.delay(DEEP_SCRAPE_DELAY_MS);
        
        const response = await axios.get(job.url, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml',
          },
          timeout: 15000,
        });
        
        const $ = cheerio.load(response.data);
        // На Хабре описание обычно находится в .vacancy-description__text или подобном
        const fullDesc = $('.vacancy-description__text, .style-ugc').text().trim();
        
        if (fullDesc) {
          job.description = fullDesc.replace(/\n\s*\n/g, '\n').trim();
        }
      } catch (error) {
        console.warn(`[Parser:Habr] ⚠️ Ошибка глубокого парсинга для ${job.url}: ${error.message}. Fallback на snippet.`);
        job.deepScrapeFailed = true;
      }
    };

    // Ограничение параллелизма
    await this.fetchDeepWithConcurrency(jobs, fetchFn, 2); // Хабр строже, лучше concurrency = 2
  }

  parseSalaryText(text) {
    if (!text) return { min: null, max: null, currency: 'RUB' };

    let currency = 'RUB';
    if (text.includes('$') || text.toLowerCase().includes('usd')) currency = 'USD';
    else if (text.includes('€') || text.toLowerCase().includes('eur')) currency = 'EUR';
    else if (text.toLowerCase().includes('byn') || text.toLowerCase().includes('бел')) currency = 'BYN';

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

  getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  getRandomDelay() {
    return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
  }
}

const parser = new HabrParser();
module.exports = { parse: parser.parse.bind(parser), HabrParser };
