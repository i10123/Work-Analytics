/**
 * Форматирует число зарплаты с разделителями тысяч.
 * @param {number} value — Число.
 * @returns {string} — Отформатированная строка ("120 000").
 */
export function formatSalary(value) {
  if (!value) return '—';
  return value.toLocaleString('ru-RU');
}

/**
 * Короткий формат зарплаты для осей графиков (например: "120K").
 * @param {number} value — Число.
 * @returns {string}
 */
export function formatSalaryShort(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

/**
 * Экранирует HTML-спецсимволы (защита от XSS).
 * @param {string} text — Исходная строка.
 * @returns {string} — Безопасная строка.
 */
export function escapeHtml(text) {
  if (!text) return '';
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}
