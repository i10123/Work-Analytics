class BaseParser {
  constructor(name) {
    this.name = name;
    this.MAX_PAGES_TO_SCAN = 15;
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async parse(query, filters = {}) {
    throw new Error(`[${this.name}] Метод parse() должен быть переопределен.`);
  }
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

  compileStopWords(stopWordsStr) {
    if (!stopWordsStr) return [];
    return stopWordsStr.split(',').map(w => w.trim()).filter(Boolean)
      .map(w => {
        const safeWord = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?<=^|[^\\p{L}])${safeWord}(?=[^\\p{L}]|$)`, 'iu');
      });
  }
  hasStopWords(title, compiledRegexes) {
    if (!compiledRegexes || compiledRegexes.length === 0) return false;
    return compiledRegexes.some(regex => regex.test(title));
  }

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
