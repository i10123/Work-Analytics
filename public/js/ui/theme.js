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

  setTimeout(() => {
    if (window.Chart) {
      const rootStyles = getComputedStyle(document.documentElement);
      Chart.defaults.font.family = rootStyles.getPropertyValue('--font-family').trim() || "'Outfit', 'nbrb', sans-serif";
    }

    if (currentReport) {
      renderDashboard(currentReport);
    }
  }, 10);
}
