/**
 * common.js
 * Суть: Вспомогательные утилиты для работы с интерфейсом.
 * Что делает: Обеспечивает базовую функциональность переключения экранов приложения и отображения уведомлений (тостов).
 * Что содержит: Функции showScreen для навигации между разделами и showToast для вывода сообщений.
 */
import { DOM } from '../dom.js';
import { escapeHtml } from '../utils/formatters.js';

export function showScreen(screen) {
  if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = screen === 'welcome' ? 'flex' : 'none';
  if (DOM.progressSection) DOM.progressSection.style.display = screen === 'progress' ? 'flex' : 'none';
  if (DOM.dashboard) DOM.dashboard.style.display = screen === 'dashboard' ? 'block' : 'none';

  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
}

export function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${type === 'success' ? '✅' : '❌'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
