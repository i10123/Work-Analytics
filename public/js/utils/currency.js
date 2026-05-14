/**
 * Модуль с утилитами для работы с валютами.
 * 
 * Содержит функции:
 * - convertCurrency: для конвертации значений между валютами с учетом курсов обмена.
 * - getCurrencySymbol: для получения текстового/специального символа валюты по её коду.
 */

export function convertCurrency(amount, from, to, rates) {
  if (!amount || from === to)
    return amount;
  const inRub = amount * (rates[from] || 1);
  const result = inRub / (rates[to] || 1);
  return Math.round(result * 100) / 100;
}

export function getCurrencySymbol(currency) {
  const symbols = { RUB: '₽', USD: '$', EUR: '€', BYN: '\uE901' };
  return symbols[currency] || currency;
}
