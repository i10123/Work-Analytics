
import { renderDashboard } from './dashboard.js';
import { appStore } from '../state.js';

import { loadSettings } from '../utils/settings.js';

export function initializeTheme() {
  const settings = loadSettings();
  setAppTheme(settings.theme || 'slate-modernity');
}

export function setAppTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);

  setTimeout(() => {
    if (window.Chart) {
      const rootStyles = getComputedStyle(document.documentElement);
      Chart.defaults.font.family = rootStyles.getPropertyValue('--font-family').trim() || "'Outfit', 'nbrb', sans-serif";
    }

    const { currentReport } = appStore.getState();
    if (currentReport) {
      renderDashboard(currentReport);
    }
  }, 10);
}
