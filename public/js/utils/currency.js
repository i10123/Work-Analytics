/**
 * Конвертирует сумму из одной валюты в другую (клиентская сторона).
 * @param {number} amount — Сумма.
 * @param {string} from — Исходная валюта.
 * @param {string} to — Целевая валюта.
 * @param {Object} rates — Курсы (1 единица = X RUB).
 * @returns {number} — Сконвертированная сумма.
 */
export function convertCurrency(amount, from, to, rates) {
  if (!amount || from === to) return amount;
  const inRub = amount * (rates[from] || 1);
  return Math.round(inRub / (rates[to] || 1));
}

/**
 * Возвращает символ валюты.
 * @param {string} currency — ISO-код валюты.
 * @returns {string} — Символ (₽, $, €, Br).
 */
export function getCurrencySymbol(currency) {
  const symbols = { RUB: '₽', USD: '$', EUR: '€', BYN: 'BYN' };
  return symbols[currency] || currency;
}
