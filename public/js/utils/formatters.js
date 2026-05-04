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

const HTML_ENTITIES = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
};

/**
 * Экранирует HTML-спецсимволы (защита от XSS).
 * @param {string} text — Исходная строка.
 * @returns {string} — Безопасная строка.
 */
export function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>'"]/g, tag => HTML_ENTITIES[tag]);
}

/**
 * Форматирует продолжительность в секундах в читабельный вид (минуты и секунды).
 * @param {number} seconds — Время в секундах.
 * @returns {string} — Отформатированная строка (например: "2 мин 5 сек" или "45 сек").
 */
export function formatDuration(seconds) {
  if (seconds < 0) seconds = 0;
  if (seconds < 60) return `${seconds} сек.`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} мин. ${s} сек.`;
}

/**
 * Простой парсер Markdown в HTML для AI-сводки.
 * @param {string} md — Текст в формате Markdown.
 * @returns {string} — HTML строка.
 */
export function parseMarkdown(md) {
  if (!md) return '';
  
  let html = escapeHtml(md);

  // Жирный текст: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Курсив: *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Заголовки: ### Header
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Неупорядоченные списки: - item или * item
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>'); // Оборачиваем группы li в ul (очень простой вариант)
  
  // Переносы строк
  html = html.replace(/\n$/gim, '<br />');

  return html;
}

