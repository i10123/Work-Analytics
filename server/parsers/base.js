/**
 * @file base.js — Базовый класс для всех парсеров.
 * @description Содержит общие утилиты для парсинга (ограничение параллелизма, задержки).
 */

class BaseParser {
  constructor(name) {
    this.name = name;
    this.MAX_PAGES_TO_SCAN = 15;
  }

  /**
   * Задержка (sleep).
   * @param {number} ms 
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Базовый метод парсинга. Должен быть переопределен в наследниках.
   */
  async parse(query, filters = {}) {
    throw new Error(`[${this.name}] Метод parse() должен быть переопределен.`);
  }

  /**
   * Выполняет глубокий скрапинг с ограничением параллелизма.
   * @param {Array} items — Массив элементов для скрапинга.
   * @param {Function} fetchFn — Функция (item) => Promise<any>.
   * @param {number} concurrencyLimit — Максимальное количество одновременных запросов.
   */
  async fetchDeepWithConcurrency(items, fetchFn, concurrencyLimit = 3) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
      const fetchPromise = fetchFn(item);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Таймаут парсинга (15с)')), 15000);
      });

      const promise = Promise.race([fetchPromise, timeoutPromise])
        .catch(err => {
          console.warn(`[BaseParser] Ошибка элемента: ${err.message}`);
          return null;
        })
        .finally(() => executing.delete(promise));

      results.push(promise);
      executing.add(promise);

      if (executing.size >= concurrencyLimit) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }

  /**
   * Компилирует строку стоп-слов в массив RegExp ОДИН РАЗ.
   * Вызывай перед началом цикла парсинга, а не на каждую вакансию.
   * @param {string} stopWordsStr — Строка стоп-слов через запятую.
   * @returns {RegExp[]} — Массив скомпилированных регулярок.
   */
  compileStopWords(stopWordsStr) {
    if (!stopWordsStr) return [];
    return stopWordsStr.split(',').map(w => w.trim()).filter(Boolean)
      .map(w => {
        // Экранируем специальные символы для предотвращения Regex Injection
        const safeWord = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?<=^|[^\\p{L}])${safeWord}(?=[^\\p{L}]|$)`, 'iu');
      });
  }

  /**
   * Проверка на стоп-слова по предкомпилированным регуляркам.
   * @param {string} title 
   * @param {RegExp[]} compiledRegexes — Массив из compileStopWords().
   * @returns {boolean} true, если найдено стоп-слово
   */
  hasStopWords(title, compiledRegexes) {
    if (!compiledRegexes || compiledRegexes.length === 0) return false;
    return compiledRegexes.some(regex => regex.test(title));
  }

  /**
   * Приводит валюту к единому стандарту.
   * @param {string} currency 
   * @param {string} fallback 
   * @returns {string}
   */
  mapCurrency(currency, fallback = 'RUB') {
    const map = {
      RUR: 'RUB', RUB: 'RUB', USD: 'USD', EUR: 'EUR',
      BYR: 'BYN', BYN: 'BYN', KZT: 'KZT', UAH: 'UAH',
      UZS: 'UZS', GEL: 'GEL', AZN: 'AZN', KGS: 'KGS',
    };
    return map[currency] || currency || fallback;
  }
}

module.exports = BaseParser;
