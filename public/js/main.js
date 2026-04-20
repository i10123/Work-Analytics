import { DOM } from './dom.js';
import { initializeTheme } from './ui/theme.js';
import { loadSettings } from './utils/settings.js';
import { setCurrentCurrency, currentReport } from './state.js';
import { loadReportsList } from './api.js';
import { setupSSE } from './ui/sse.js';
import { openModal, closeModal, handleFormSubmit } from './ui/modal.js';
import { renderDashboard } from './ui/dashboard.js';
import { setupSettingsListeners, setupStepperListeners, setupSegmentedControlListeners } from './ui/settings.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] 🚀 Инициализация Work Analytics (Modular)...');

  initializeTheme();
  initializeSettings();
  setupEventListeners();
  setupSSE();
  loadReportsList();
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
}
