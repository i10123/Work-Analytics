const axios = require('axios');

const FALLBACK_RATES = {
  RUB: 1,
  USD: 73.3,
  EUR: 85.5,
  BYN: 26.2,
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

        currentRateKeyIndex = activeKeyIndex;

        console.log(`[Currency] ✅ Курсы получены: 1 USD = ${rates.USD} RUB`);
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

  const amountInRub = amount * (rates[fromCurrency] || 1);
  const result = amountInRub / (rates[toCurrency] || 1);

  return Math.round(result * 100) / 100;
}

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
};
