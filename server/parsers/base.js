class BaseParser {
  constructor(name) {
    this.name = name;
    this.MAX_PAGES_TO_SCAN = 15;
  }

  async delay(ms, cancelFlag = null) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (cancelFlag?.abortController?.signal) {
        cancelFlag.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Прервано'));
        }, { once: true });
      }
    });
  }

  async parse(query, filters = {}) {
    throw new Error(`[${this.name}] Метод parse() должен быть переопределен.`);
  }
  async fetchDeepWithConcurrency(items, fetchFn, concurrencyLimit = 3, cancelFlag = null) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
      if (cancelFlag?.isStopped) break;

      const fetchPromise = fetchFn(item);
      let timerId;
      let abortHandler;

      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Таймаут парсинга (15с)')), 15000);
        
        if (cancelFlag?.abortController?.signal) {
          abortHandler = () => {
            clearTimeout(timerId);
            reject(new Error('Парсинг прерван (cancelFlag)'));
          };
          cancelFlag.abortController.signal.addEventListener('abort', abortHandler, { once: true });
        }
      });

      const promise = Promise.race([fetchPromise, timeoutPromise])
        .catch(err => {
          if (err.message.includes('прерван') || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
             console.warn(`[BaseParser] Парсинг элемента прерван.`);
          } else {
             console.warn(`[BaseParser] Ошибка элемента: ${err.message}`);
          }
          return null;
        })
        .finally(() => {
          clearTimeout(timerId);
          if (cancelFlag?.abortController?.signal && abortHandler) {
            cancelFlag.abortController.signal.removeEventListener('abort', abortHandler);
          }
          executing.delete(promise);
        });

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
