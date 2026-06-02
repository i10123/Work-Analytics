const axios = require('axios');
const cheerio = require('cheerio');
const BaseParser = require('./base');

const HABR_BASE = 'https://career.habr.com';
const MIN_DELAY_MS = 2500;
const MAX_DELAY_MS = 5000;
const DEEP_SCRAPE_DELAY_MS = 3000;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
];

class HabrParser extends BaseParser {
  constructor() {
    super('Хабр Карьера');
    this.currentConcurrency = 2;
    this.activeBackoffDelay = null;
  }

  // Получение заголовков для маскировки под браузер
  _getHeaders() {
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Ch-Ua': '"Chromium";v="125", "Not.A/Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };
  }

  // Выполнение HTTP-запроса с адаптивной задержкой
  async _requestWithAdaptiveBackoff(url, config, cancelFlag) {
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (cancelFlag?.isStopped) throw new Error('Задача отменена');

      if (this.activeBackoffDelay) {
        console.log(`[Parser:Habr] ⏳ Режим задержки: ожидание ${this.activeBackoffDelay}мс...`);
        await this.delay(this.activeBackoffDelay, cancelFlag);
      }

      try {
        const response = await axios.get(url, config);
        if (this.activeBackoffDelay) {
          console.log(`[Parser:Habr] ✅ Запрос успешен. Восстанавливаем стандартный режим.`);
          this.activeBackoffDelay = null;
          this.currentConcurrency = 2;
        }
        return response;
      } catch (error) {
        lastError = error;
        const status = error.response?.status;

        if (status === 429 || status === 403) {
          this.activeBackoffDelay = 8000;
          this.currentConcurrency = 1;
          console.warn(
            `[Parser:Habr] ⚠️ Получена ошибка HTTP ${status} (попытка ${attempt + 1}/${maxRetries}). ` +
            `Включаем Adaptive Backoff: снижаем потоки до 1, задержка увеличена до 8 секунд.`
          );
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Все попытки Adaptive Backoff исчерпаны');
  }

  // Основной метод сбора вакансий
  async parse(query, filters = {}, cancelFlag = null) {
    const limit = filters.limit || 50;
    const stopRegexes = this.compileStopWords(filters.stopWords || '');
    let maxPages = this.MAX_PAGES_TO_SCAN;

    console.log(`[Parser:Habr] 🔍 Поиск: "${query}", лимит: ${limit}`);

    const allJobs = [];

    for (let page = 1; page <= maxPages; page++) {
      if (cancelFlag?.isStopped) {
        console.log(`[Parser:Habr] 🛑 Задача остановлена. Прерываем парсинг.`);
        break;
      }

      console.log(`[Parser:Habr] 📄 Загрузка страницы ${page}/${maxPages}...`);

      try {
        const url = `${HABR_BASE}/vacancies`;
        const response = await this._requestWithAdaptiveBackoff(url, {
          params: {
            q: query,
            page: page,
            type: 'all',
          },
          headers: this._getHeaders(),
          timeout: 15000,
          signal: cancelFlag?.abortController?.signal || undefined,
        }, cancelFlag);

        const html = response.data;

        if (page === 1) {
          const $paginate = cheerio.load(html);
          let foundMaxPage = 0;
          $paginate('a').each((_, el) => {
            const href = $paginate(el).attr('href');
            if (href) {
              const match = href.match(/[?&]page=(\d+)/);
              if (match) {
                const pNum = parseInt(match[1], 10);
                if (pNum > foundMaxPage) {
                  foundMaxPage = pNum;
                }
              }
            }
          });
          if (foundMaxPage > 1 && foundMaxPage < maxPages) {
            maxPages = foundMaxPage;
            console.log(`[Parser:Habr] 📄 Обновлен лимит страниц из пагинации: ${maxPages}`);
          } else if (foundMaxPage === 0) {
            maxPages = 1;
            console.log(`[Parser:Habr] 📄 Пагинация не найдена. Ограничиваем до 1 страницы.`);
          }
        }

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
          await this.delay(delay, cancelFlag);
        }
      } catch (error) {
        if (cancelFlag?.isStopped || error.name === 'AbortError' || error.code === 'ERR_CANCELED' || error.message.includes('canceled') || error.message.includes('abort')) {
          console.log(`[Parser:Habr] 🛑 Запрос прерван. Прерываем парсинг и сохраняем собранные данные.`);
          break;
        }
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

  // Парсинг HTML-кода страницы со списком вакансий
  parseHabrHTML(html) {
    const $ = cheerio.load(html);
    const jobs = [];

    let $cards = $('.vacancy-card');

    if ($cards.length === 0) {
      const fallbackCards = [];
      $('a[href^="/vacancies/"]').each((_, link) => {
        const $parent = $(link).closest('div, article, section');
        if ($parent.length && !fallbackCards.includes($parent[0])) {
          if ($parent.text().length < 5000) {
            fallbackCards.push($parent[0]);
          }
        }
      });

      if (fallbackCards.length > 0) {
        $cards = $(fallbackCards);
        console.warn(`[Parser:Habr] ⚠️ Класс .vacancy-card не найден. Используется fallback-поиск (${$cards.length} возможных карточек).`);
      } else {
        console.warn(`[Parser:Habr] ❌ Не найдено ни одной карточки вакансии. Вёрстка Habr могла измениться.`);
      }
    }

    $cards.each((_, element) => {
      try {
        const $card = $(element);

        const title = $card.find('.vacancy-card__title a').text().trim() ||
          $card.find('[class*="title"] a').text().trim() ||
          $card.find('a[href^="/vacancies/"]').first().text().trim();

        const url = $card.find('.vacancy-card__title a').attr('href') ||
          $card.find('[class*="title"] a').attr('href') ||
          $card.find('a[href^="/vacancies/"]').first().attr('href') || '';

        let company = $card.find('.vacancy-card__company-title a').text().trim() ||
          $card.find('[class*="company"] a').text().trim() || 'Не указана';
        company = company.replace(/\d+\.\d+[\s\u200B]*$/, '').trim();

        const salaryText = $card.find('.vacancy-card__salary, [class*="salary"]').text().trim();
        const salary = this.parseSalaryText(salaryText);

        const skills = [];
        $card.find('.vacancy-card__skills .preserve-line, [class*="skill"]').each((_, skillEl) => {
          const $el = $(skillEl);
          const className = $el.attr('class') || '';
          if (className.includes('skills')) {
            return;
          }
          const skill = $el.text().trim();
          if (skill && !skills.includes(skill)) {
            skills.push(skill);
          }
        });

        const description = $card.find('.vacancy-card__description, [class*="snippet"]').text().trim();

        const metaNodes = [];
        $card.find('.vacancy-card__meta .inline-list > *').each((_, el) => {
          metaNodes.push($(el).text().trim());
        });
        const metaText = metaNodes.join(' | ') || $card.find('.vacancy-card__meta').text().trim();
        const lowerMeta = metaText.toLowerCase();

        const publishedAt = $card.find('time.basic-date').attr('datetime') || $card.find('time').attr('datetime') || '';


        let experience = '';
        if (lowerMeta.match(/стажер|стажёр|intern/)) experience = 'Intern';
        else if (lowerMeta.match(/junior|младший/)) experience = 'Junior';
        else if (lowerMeta.match(/middle|средний/)) experience = 'Middle';
        else if (lowerMeta.match(/senior|старший/)) experience = 'Senior';
        else if (lowerMeta.match(/lead|ведущий/)) experience = 'Lead';


        let employment = '';
        if (lowerMeta.match(/полн/)) employment = 'Полная занятость';
        else if (lowerMeta.match(/неполн|частичн/)) employment = 'Частичная занятость';
        else if (lowerMeta.match(/проект/)) employment = 'Проектная работа';


        let city = 'Не указан';
        const cityCandidate = metaNodes.find(n => !n.toLowerCase().match(/(полн|частичн|проект|junior|middle|senior|lead|стажер|младший|средний|старший|ведущий)/));
        if (cityCandidate) {
          city = cityCandidate;
        } else {
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

  // Глубокий парсинг детального описания вакансий
  async fetchDeepDescriptions(jobs, cancelFlag = null) {
    const fetchFn = async (job) => {
      if (cancelFlag?.isStopped) return;

      try {
        await this.delay(DEEP_SCRAPE_DELAY_MS, cancelFlag);

        const response = await this._requestWithAdaptiveBackoff(job.url, {
          headers: this._getHeaders(),
          timeout: 15000,
          signal: cancelFlag?.abortController?.signal || undefined,
        }, cancelFlag);

        const $ = cheerio.load(response.data);
        const fullDesc = $('.vacancy-description__text, .style-ugc').text().trim();

        if (fullDesc) {
          job.description = fullDesc.replace(/\n\s*\n/g, '\n').trim();
        }
      } catch (error) {
        console.warn(`[Parser:Habr] ⚠️ Ошибка глубокого парсинга для ${job.url}: ${error.message}. Fallback на snippet.`);
        job.deepScrapeFailed = true;
      }
    };

    await this.fetchDeepWithConcurrency(jobs, fetchFn, this.currentConcurrency, cancelFlag);
  }

  // Разбор текстового описания зарплаты
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

  // Получение случайного User-Agent из списка
  getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  // Получение случайной задержки для имитации человека
  getRandomDelay() {
    return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
  }
}

const parser = new HabrParser();
module.exports = { parse: parser.parse.bind(parser), HabrParser };