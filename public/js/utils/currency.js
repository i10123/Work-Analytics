

export function convertCurrency(amount, from, to, rates) {
  if (!amount || from === to)
    return amount;
  const inBase = amount * (rates[from] || 1);
  const result = inBase / (rates[to] || 1);
  return Math.round(result * 100) / 100;
}

export function getCurrencySymbol(currency) {
  const symbols = { RUB: '₽', USD: '$', EUR: '€', BYN: '\uE901' };
  return symbols[currency] || currency;
}
