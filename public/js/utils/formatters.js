/**
 * Модуль для форматирования данных и текста.
 * 
 * Содержит функции:
 * - formatSalary: форматирование суммы (с разделением групп разрядов).
 * - escapeHtml: экранирование спецсимволов HTML для безопасности.
 * - formatDuration: форматирование секунд в читаемую строку (минуты/секунды).
 * - parseMarkdown: базовая конвертация Markdown-разметки в HTML.
 */

export function formatSalary(value) {
  if (!value)
    return '—';
  return value.toLocaleString('ru-RU');
}


const HTML_ENTITIES = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
};

export function escapeHtml(text) {
  if (!text)
    return '';
  return String(text).replace(/[&<>'"]/g, tag => HTML_ENTITIES[tag]);
}

export function formatDuration(seconds) {
  if (seconds < 0)
    seconds = 0;

  if (seconds < 60)
    return `${seconds} сек.`;
    
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h} ч. ${m} мин.`;
  }
  return `${m} мин. ${s} сек.`;
}

export function parseMarkdown(md) {
  if (!md) return '';
  if (typeof window !== 'undefined' && window.marked) {
    return window.marked.parse(md);
  }
  // Fallback
  let html = escapeHtml(md);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(?:<li>.*?<\/li>\s*)+/g, '<ul>$&</ul>');
  html = html.replace(/\n$/gim, '<br />');
  return html;
}