import { DOM } from './dom.js';
import { initializeTheme } from './ui/theme.js';
import { loadSettings } from './utils/settings.js';
import { setCurrentCurrency, currentReport } from './state.js';
import { loadReportsList, loadReportById } from './report.js';

import { openModal, closeModal, handleFormSubmit } from './ui/modal.js';
import { renderDashboard } from './ui/dashboard.js';
import { showScreen } from './ui/common.js';
import { setupSidebarListeners, loadQueueUI } from './ui/sidebar.js';
import { setupSettingsListeners, setupStepperListeners, setupSegmentedControlListeners } from './ui/settings.js';
import { initializePremiumUI } from './ui/ui-premium.js';
import { setupWelcomeScreen, updateWelcomeStats } from './ui/welcome.js';

document.addEventListener('DOMContentLoaded', async () => {
  initializeTheme();

  initializeSettings();
  initializePremiumUI();
  setupEventListeners();
  setupLimitValidation();
  setupWelcomeScreen();

  let isRestoredProgress = false;

  try {
    const queueRes = await fetch('/api/queue');
    const queueData = await queueRes.json();

    if (queueData.success && queueData.currentTask && queueData.currentTask.status === 'processing') {
      showScreen('progress');
      if (DOM.progressTitle)
        DOM.progressTitle.textContent = `Сбор данных: "${queueData.currentTask.query || ''}"`;
      isRestoredProgress = true;
    }
  } catch (e) {
    console.warn('[App] ⚠️ Не удалось проверить состояние очереди:', e.message);
  }

  await loadReportsList();
  updateWelcomeStats();

  await loadQueueUI();

  if (!isRestoredProgress) {
    const hash = window.location.hash;

    if (hash && hash.startsWith('#report=')) {
      const reportId = hash.replace('#report=', '');
      loadReportById(reportId, true);
    } else {
      showScreen('welcome');
      history.replaceState({ type: 'welcome' }, '', window.location.pathname);
    }
  }
});

function initializeSettings() {
  const settings = loadSettings();

  setCurrentCurrency(settings.defaultCurrency);

  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === settings.defaultCurrency);
  });

  if (DOM.selectPeriod)
    DOM.selectPeriod.value = settings.defaultPeriod;
  if (DOM.inputLimit)
    DOM.inputLimit.value = settings.defaultLimit;
}

function setupEventListeners() {

  DOM.sidebarToggle?.addEventListener('click', () => {
    DOM.sidebar?.classList.toggle('collapsed');
  });

  DOM.btnNewReport?.addEventListener('click', openModal);

  DOM.btnBackToWelcome?.addEventListener('click', () => {
    showScreen('welcome');
    history.pushState({ type: 'welcome' }, '', window.location.pathname);
    document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
  });
  window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (state && state.type === 'report') {
      loadReportById(state.id, true);
    } else {
      showScreen('welcome');
      document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
    }
  });

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
      updateWelcomeStats();
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
  if (DOM.sidebarLogs)
    DOM.sidebarLogs.classList.add('collapsed');
}

function setupLimitValidation() {
  const limits = [DOM.inputLimit, DOM.settingsDefaultLimit];

  limits.forEach(input => {
    if (!input) return;

    const validate = () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val)) return;

      let message = '';
      if (val < 5) {
        input.value = 5;
        message = 'Минимальное количество вакансий: 5';
      } else if (val > 200) {
        input.value = 200;
        message = 'Максимальное количество вакансий: 200';
      }

      if (message) {
        import('./ui/common.js').then(({ showToast }) => showToast(message, 'error'));
      }
    };

    input.addEventListener('change', validate);
  });
}

