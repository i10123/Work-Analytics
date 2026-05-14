/**
 * theme.js
 * Суть: Контроллер визуальных тем приложения.
 * Что делает: Отвечает за применение выбранной темы к документу, её сохранение в localStorage и перерисовку графиков под цветовую схему.
 * Что содержит: Функции initializeTheme и setAppTheme для смены data-атрибута темы на корневом элементе.
 */
import { renderDashboard } from './dashboard.js';
import { currentReport } from '../state.js';

export function initializeTheme() {
  const savedTheme = localStorage.getItem('app-theme') || 'slate-modernity';
  setAppTheme(savedTheme);
}

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
