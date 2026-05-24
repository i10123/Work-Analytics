const axios = require('axios');

const FALLBACK_RATES = {
  BYN: 1,
  RUB: 0.0383, // 100 RUB = 3.83 BYN => 1 RUB = 0.0383 BYN
  USD: 2.85,   // 1 USD = 2.85 BYN
  EUR: 3.355,  // 1 EUR = 3.355 BYN
};

let currentRateKeyIndex = 0;

let cachedRates = null;
let lastFetchTime = null;
const CACHE_TTL = 12 * 60 * 60 * 1000;

function getRateKeys() {
  const keysStr = process.env.EXCHANGE_RATE_API_KEYS || '';
  return keysStr.split(',').map(k => k.trim()).filter(k => k && !k.startsWith('YOUR_') && !/^key\d*$/.test(k));
}

async function fetchExchangeRates() {
  const now = Date.now();

  if (cachedRates && lastFetchTime && (now - lastFetchTime < CACHE_TTL)) {
    console.log('[Currency] 📦 Используются закэшированные курсы валют (TTL).');
    return cachedRates;
  }

  const keys = getRateKeys();

  if (keys.length === 0) {
    console.warn('[Currency] ⚠️ API-ключи для курсов валют не заданы в .env. Используются резервные курсы.');
    return buildRatesResponse(FALLBACK_RATES, true);
  }
  for (let i = 0; i < keys.length; i++) {
    const activeKeyIndex = (currentRateKeyIndex + i) % keys.length;
    const apiKey = keys[activeKeyIndex];

    try {
      console.log(`[Currency] 🌐 Запрос курсов (Ключ #${activeKeyIndex + 1}/${keys.length})...`);

      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/BYN`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.data && response.data.result === 'success') {
        const apiRates = response.data.conversion_rates;
        const rates = {
          BYN: 1,
          RUB: apiRates.RUB ? +(1 / apiRates.RUB).toFixed(4) : FALLBACK_RATES.RUB,
          USD: apiRates.USD ? +(1 / apiRates.USD).toFixed(4) : FALLBACK_RATES.USD,
          EUR: apiRates.EUR ? +(1 / apiRates.EUR).toFixed(4) : FALLBACK_RATES.EUR,
        };

        currentRateKeyIndex = activeKeyIndex;

        console.log(`[Currency] ✅ Курсы получены: 1 USD = ${rates.USD} BYN, 100 RUB = ${(rates.RUB * 100).toFixed(2)} BYN`);
        const responseObj = buildRatesResponse(rates, false);
        cachedRates = responseObj;
        lastFetchTime = Date.now();

        return responseObj;
      }
    } catch (error) {
      console.warn(`[Currency] ⚠️ Ключ #${activeKeyIndex + 1} не сработал: ${error.message}`);
    }
  }

  console.error('[Currency] ❌ Ни один из API-ключей не сработал. Используются резервные курсы.');
  return buildRatesResponse(FALLBACK_RATES, true);
}

function convertCurrency(amount, fromCurrency, toCurrency, rates) {
  if (fromCurrency === toCurrency) return amount;

  const amountInByn = amount * (rates[fromCurrency] || 1);
  const result = amountInByn / (rates[toCurrency] || 1);

  return Math.round(result * 100) / 100;
}

function buildRatesResponse(rates, isFallback) {
  return {
    base: 'BYN',
    rates,
    fetchedAt: new Date().toISOString(),
    isFallback,
  };
}

module.exports = {
  fetchExchangeRates,
  convertCurrency,
};
