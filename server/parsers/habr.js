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

  async parse(query, filters = {}, cancelFlag = null) {
    const limit = filters.limit || 50;
    // Компилируем стоп-слова ОДИН РАЗ до начала цикла
    const stopRegexes = this.compileStopWords(filters.stopWords || '');
    
    // Хабр показывает ~25 вакансий на странице
    // Ограничиваем максимальное количество страниц
    const maxPages = this.MAX_PAGES_TO_SCAN;

    console.log(`[Parser:Habr] 🔍 Поиск: "${query}", лимит: ${limit}`);

    const allJobs = [];

    for (let page = 1; page <= maxPages; page++) {
      // Проверка флага отмены
      if (cancelFlag?.isStopped) {
        console.log(`[Parser:Habr] 🛑 Задача остановлена. Прерываем парсинг.`);
        break;
      }

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
          signal: cancelFlag?.abortController?.signal || undefined,
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

    if (filters.deepScrape && allJobs.length > 0 && !cancelFlag?.isStopped) {
      console.log(`[Parser:Habr] 🕵️ Начинается глубокий парсинг для ${allJobs.length} вакансий...`);
      await this.fetchDeepDescriptions(allJobs, cancelFlag);
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
        
        let company = $card.find('.vacancy-card__company-title a').text().trim() ||
                      $card.find('[class*="company"] a').text().trim() || 'Не указана';
        // Убираем прилипший рейтинг компании (например "VK4.0" -> "VK")
        company = company.replace(/\d+\.\d+[\s\u200B]*$/, '').trim();

        const salaryText = $card.find('.vacancy-card__salary, [class*="salary"]').text().trim();
        const salary = this.parseSalaryText(salaryText);

        const skills = [];
        $card.find('.vacancy-card__skills .preserve-line, [class*="skill"]').each((_, skillEl) => {
          const skill = $(skillEl).text().trim();
          if (skill) skills.push(skill);
        });

        const description = $card.find('.vacancy-card__description, [class*="snippet"]').text().trim();

        // Собираем все мета-данные из нового формата Хабра
        const metaNodes = [];
        $card.find('.vacancy-card__meta .inline-list > *').each((_, el) => {
          metaNodes.push($(el).text().trim());
        });
        const metaText = metaNodes.join(' | ') || $card.find('.vacancy-card__meta').text().trim();
        const lowerMeta = metaText.toLowerCase();

        const publishedAt = $card.find('time.basic-date').attr('datetime') || $card.find('time').attr('datetime') || '';

        // Опыт
        let experience = '';
        if (lowerMeta.match(/стажер|стажёр|intern/)) experience = 'Intern';
        else if (lowerMeta.match(/junior|младший/)) experience = 'Junior';
        else if (lowerMeta.match(/middle|средний/)) experience = 'Middle';
        else if (lowerMeta.match(/senior|старший/)) experience = 'Senior';
        else if (lowerMeta.match(/lead|ведущий/)) experience = 'Lead';

        // Занятость
        let employment = '';
        if (lowerMeta.match(/полн/)) employment = 'Полная занятость';
        else if (lowerMeta.match(/неполн|частичн/)) employment = 'Частичная занятость';
        else if (lowerMeta.match(/проект/)) employment = 'Проектная работа';

        // Город (обычно это слово в мете, которое не является квалификацией или типом работы)
        let city = 'Не указан';
        const cityCandidate = metaNodes.find(n => !n.toLowerCase().match(/(полн|частичн|проект|junior|middle|senior|lead|стажер|младший|средний|старший|ведущий)/));
        if (cityCandidate) {
          city = cityCandidate;
        } else {
          // Fallback
          city = $card.find('.vacancy-card__meta [class*="location"]').text().trim() || 'Не указан';
        }

        let finalDescription = description;
        if (!finalDescription || finalDescription.length < 50) {
          const skillsText = skills.length > 0 ? `Ключевые навыки: ${skills.join(', ')}` : '';
          finalDescription = [title, finalDescription, skillsText].filter(Boolean).join('\n\n');
        }

        const isRemote = city.toLowerCase().includes('удаленно') || 
                         city.toLowerCase().includes('удалённо') || 
                         lowerMeta.includes('удаленно') || 
                         lowerMeta.includes('удалённо') || 
                         lowerMeta.includes('remote') ||
                         skills.some(s => s.toLowerCase() === 'remote' || s.toLowerCase() === 'удаленная работа');
        const workFormat = isRemote ? 'Remote' : 'Office';

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

  async fetchDeepDescriptions(jobs, cancelFlag = null) {
    const fetchFn = async (job) => {
      if (cancelFlag?.isStopped) return;

      try {
        await this.delay(DEEP_SCRAPE_DELAY_MS);
        
        const response = await axios.get(job.url, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml',
          },
          timeout: 15000,
          signal: cancelFlag?.abortController?.signal || undefined,
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
      const sorted = [...cleanedNumbers].sort((a, b) => a - b);
      return { min: sorted[0], max: sorted[sorted.length - 1], currency };
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
