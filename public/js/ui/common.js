import { DOM } from '../dom.js';
import { escapeHtml } from '../utils/formatters.js';

/**
 * Переключает видимый экран (welcome / progress / dashboard).
 * @param {string} screen — welcome | progress | dashboard
 */
export function showScreen(screen) {
  if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = screen === 'welcome' ? 'flex' : 'none';
  if (DOM.progressSection) DOM.progressSection.style.display = screen === 'progress' ? 'flex' : 'none';
  if (DOM.dashboard) DOM.dashboard.style.display = screen === 'dashboard' ? 'block' : 'none';
}

/**
 * Показывает всплывающее уведомление (toast).
 * @param {string} message — Текст уведомления.
 * @param {'success'|'error'} type — Тип уведомления.
 */
export function showToast(message, type = 'success') {
  /** Удаляем предыдущий тост, если есть */
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${type === 'success' ? '✅' : '❌'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  /** Автоудаление через 3 секунды */
  setTimeout(() => {
    toast.classList.add('toast--exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
