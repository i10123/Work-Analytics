import { renderDashboard } from './dashboard.js';
import { currentReport } from '../state.js';

/**
 * Инициализирует тему оформления из localStorage.
 */
export function initializeTheme() {
  const savedTheme = localStorage.getItem('app-theme') || 'slate-modernity';
  setAppTheme(savedTheme);
}

/**
 * Устанавливает тему оформления.
 * @param {string} theme 
 */
export function setAppTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);

  if (currentReport) {
    renderDashboard(currentReport);
  }
}
