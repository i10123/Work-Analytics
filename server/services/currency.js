/**
 * @file currency.js — Модуль мультивалютной конвертации.
 * @description Получает актуальные курсы валют через ExchangeRate-API.
 *              При недоступности API использует резервные (fallback) курсы.
 *              Поддерживаемые валюты: RUB, USD, EUR, BYN.
 */

const axios = require('axios');

/**
 * Резервные курсы валют (fallback).
 * Используются, если ExchangeRate-API недоступен.
 * Все курсы указаны относительно 1 RUB.
 * @type {Object<string, number>}
 */
const FALLBACK_RATES = {
  RUB: 1,
  USD: 93.5,
  EUR: 100.2,
  BYN: 28.5,
};

/** Текущий индекс ключа для валют */
let currentRateKeyIndex = 0;

/**
 * Получает массив ключей из переменной окружения.
 * @returns {string[]}
 */
function getRateKeys() {
  const keysStr = process.env.EXCHANGE_RATE_API_KEYS || '';
  return keysStr.split(',').map(k => k.trim()).filter(k => k && !k.startsWith('YOUR_') && !/^key\d*$/.test(k));
}

/**
 * Получает актуальные курсы валют с ExchangeRate-API.
 * Базовая валюта — RUB. Результат: сколько RUB стоит 1 единица каждой валюты.
 */
async function fetchExchangeRates() {
  const keys = getRateKeys();

  /** Если ключи не заданы — сразу возвращаем fallback */
  if (keys.length === 0) {
    console.warn('[Currency] ⚠️ API-ключи для курсов валют не заданы в .env. Используются резервные курсы.');
    return buildRatesResponse(FALLBACK_RATES, true);
  }

  // Пробуем ключи по очереди, пока не сработает
  for (let i = 0; i < keys.length; i++) {
    const activeKeyIndex = (currentRateKeyIndex + i) % keys.length;
    const apiKey = keys[activeKeyIndex];

    try {
      console.log(`[Currency] 🌐 Запрос курсов (Ключ #${activeKeyIndex + 1}/${keys.length})...`);

      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/RUB`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.data && response.data.result === 'success') {
        const apiRates = response.data.conversion_rates;
        const rates = {
          RUB: 1,
          USD: apiRates.USD ? +(1 / apiRates.USD).toFixed(2) : FALLBACK_RATES.USD,
          EUR: apiRates.EUR ? +(1 / apiRates.EUR).toFixed(2) : FALLBACK_RATES.EUR,
          BYN: apiRates.BYN ? +(1 / apiRates.BYN).toFixed(2) : FALLBACK_RATES.BYN,
        };

        // Запоминаем текущий рабочий ключ, чтобы в следующий раз начать с него
        currentRateKeyIndex = activeKeyIndex;

        console.log(`[Currency] ✅ Курсы получены: 1 USD = ${rates.USD} RUB`);
        return buildRatesResponse(rates, false);
      }
    } catch (error) {
      console.warn(`[Currency] ⚠️ Ключ #${activeKeyIndex + 1} не сработал: ${error.message}`);
      // Продолжаем цикл к следующему ключу
    }
  }

  console.error('[Currency] ❌ Ни один из API-ключей не сработал. Используются резервные курсы.');
  return buildRatesResponse(FALLBACK_RATES, true);
}


/**
 * Конвертирует сумму из одной валюты в другую, используя переданные курсы.
 *
 * @param {number} amount — Исходная сумма.
 * @param {string} fromCurrency — Исходная валюта (например: "USD").
 * @param {string} toCurrency — Целевая валюта (например: "RUB").
 * @param {Object<string, number>} rates — Объект курсов (1 единица валюты = X RUB).
 * @returns {number} — Сконвертированная сумма, округлённая до целого.
 */
function convertCurrency(amount, fromCurrency, toCurrency, rates) {
  if (fromCurrency === toCurrency) return amount;

  /** Приводим всё к RUB, затем к целевой валюте */
  const amountInRub = amount * (rates[fromCurrency] || 1);
  const result = amountInRub / (rates[toCurrency] || 1);

  return Math.round(result);
}

/**
 * Формирует стандартный объект ответа с курсами.
 *
 * @param {Object<string, number>} rates — Курсы валют.
 * @param {boolean} isFallback — Использованы ли резервные курсы.
 * @returns {Object} — Стандартизированный объект курсов.
 */
function buildRatesResponse(rates, isFallback) {
  return {
    base: 'RUB',
    rates,
    fetchedAt: new Date().toISOString(),
    isFallback,
  };
}

module.exports = {
  fetchExchangeRates,
  convertCurrency,
  FALLBACK_RATES,
};
