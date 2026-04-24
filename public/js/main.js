import { DOM } from './dom.js';
import { initializeTheme } from './ui/theme.js';
import { loadSettings } from './utils/settings.js';
import { setCurrentCurrency, currentReport } from './state.js';
import { loadReportsList, loadReportById } from './api.js';
import { setupSSE } from './ui/sse.js';
import { openModal, closeModal, handleFormSubmit } from './ui/modal.js';
import { renderDashboard } from './ui/dashboard.js';
import { setupSidebarListeners } from './ui/sidebar.js';
import { setupSettingsListeners, setupStepperListeners, setupSegmentedControlListeners } from './ui/settings.js';
import { initializePremiumUI } from './ui/ui-premium.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] 🚀 Инициализация Work Analytics (Modular)...');

  initializeTheme();
  
  if (window.Chart) {
    const rootStyles = getComputedStyle(document.documentElement);
    Chart.defaults.font.family = rootStyles.getPropertyValue('--font-family').trim() || "'Outfit', 'nbrb', sans-serif";
  }

  initializeSettings();
  initializePremiumUI();
  setupEventListeners();
  setupSSE();
  
  // Загружаем список и пробуем восстановить последний отчёт
  await loadReportsList();
  
  const lastReportId = localStorage.getItem('lastReportId');
  if (lastReportId) {
    loadReportById(lastReportId);
  }
});

function initializeSettings() {
  const settings = loadSettings();
  setCurrentCurrency(settings.defaultCurrency);
  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === settings.defaultCurrency);
  });
  if (DOM.selectPeriod) DOM.selectPeriod.value = settings.defaultPeriod;
  if (DOM.inputLimit) DOM.inputLimit.value = settings.defaultLimit;
}

function setupEventListeners() {
  DOM.sidebarToggle?.addEventListener('click', () => {
    DOM.sidebar?.classList.toggle('collapsed');
  });

  DOM.btnNewReport?.addEventListener('click', openModal);

  DOM.modalClose?.addEventListener('click', closeModal);
  DOM.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === DOM.modalOverlay) closeModal();
  });

  DOM.parseForm?.addEventListener('submit', handleFormSubmit);

  DOM.currencyBtns?.forEach((btn) => {
    btn.addEventListener('click', () => {
      setCurrentCurrency(btn.dataset.currency);
      DOM.currencyBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentReport) {
        renderDashboard(currentReport);
      }
    });
  });

  if (DOM.mobileMenuToggle) {
    DOM.mobileMenuToggle.addEventListener('click', () => {
      DOM.sidebar?.classList.toggle('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
      if (DOM.sidebar && DOM.mobileMenuToggle) {
        if (!DOM.sidebar.contains(e.target) && !DOM.mobileMenuToggle.contains(e.target) && DOM.sidebar.classList.contains('open')) {
          DOM.sidebar.classList.remove('open');
        }
      }
    }
  });

  setupSettingsListeners();
  setupStepperListeners();
  setupSegmentedControlListeners();
  setupSidebarListeners();

  // Сворачиваем логи по умолчанию при загрузке
  if (DOM.sidebarLogs) DOM.sidebarLogs.classList.add('collapsed');
}
