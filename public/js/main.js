import { DOM } from './dom.js';
import { initializeTheme } from './ui/theme.js';
import { loadSettings, initSettings } from './utils/settings.js';
import { appStore } from './state.js';
import { loadReportsList, loadReportById } from './report.js';

import { openModal, closeModal, handleFormSubmit } from './ui/modal.js';
import { renderDashboard } from './ui/dashboard.js';
import { showScreen, initScrollRestoration } from './ui/common.js';
import { setupSidebarListeners, loadQueueUI } from './ui/sidebar.js';
import { setupSSE } from './ui/sse.js';
import { setupSettingsListeners, setupStepperListeners, setupSegmentedControlListeners } from './ui/settings.js';
import { initializePremiumUI } from './ui/ui-premium.js';
import { setupWelcomeScreen, updateWelcomeStats } from './ui/welcome.js';

document.addEventListener('DOMContentLoaded', () => {
  window.isProgressMinimized = sessionStorage.getItem('isProgressMinimized') === 'true';
  initializeTheme();
  initScrollRestoration();
  initializeSettings();
  initializePremiumUI();
  setupEventListeners();
  setupLimitValidation();
  setupWelcomeScreen();
  setupSSE();


  (async () => {
    await initSettings();
    initializeSettings();

    let isRestoredProgress = false;

    try {
      const queueRes = await fetch('/api/queue');
      const queueData = await queueRes.json();

      if (queueData.success && queueData.currentTask && queueData.currentTask.status === 'processing') {
        if (!window.isProgressMinimized) {
          showScreen('progress');
        }
        if (DOM.progressTitle)
          DOM.progressTitle.textContent = `Сбор данных: "${queueData.currentTask.query || ''}"`;
        isRestoredProgress = !window.isProgressMinimized;
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
  })();
});

function initializeSettings() {
  const settings = loadSettings();

  appStore.setState({ currentCurrency: settings.defaultCurrency });

  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === settings.defaultCurrency);
  });

  const welcomePeriodRadio = document.querySelector(`input[name="welcomePeriod"][value="${settings.defaultPeriod}"]`);
  if (welcomePeriodRadio) {
    welcomePeriodRadio.checked = true;
    welcomePeriodRadio.dispatchEvent(new Event('change'));
    const control = welcomePeriodRadio.closest('.segmented-control');
    if (control) control.dispatchEvent(new CustomEvent('updateIndicator'));
  }

  const welcomeInputLimit = document.getElementById('welcomeInputLimit');
  if (welcomeInputLimit) {
    welcomeInputLimit.value = settings.defaultLimit;
  }

  const welcomeSourceHH = document.getElementById('welcomeSourceHH');
  const welcomeSourceRabotaby = document.getElementById('welcomeSourceRabotaby');
  const welcomeSourceHabr = document.getElementById('welcomeSourceHabr');
  const welcomeDeepScrape = document.getElementById('welcomeDeepScrape');

  if (welcomeSourceHH) welcomeSourceHH.checked = settings.sources?.hh !== false;
  if (welcomeSourceRabotaby) welcomeSourceRabotaby.checked = settings.sources?.rabotaby !== false;
  if (welcomeSourceHabr) welcomeSourceHabr.checked = settings.sources?.habr !== false;
  if (welcomeDeepScrape) welcomeDeepScrape.checked = settings.deepScrape || false;
}

function setupEventListeners() {

  DOM.sidebarToggle?.addEventListener('click', () => {
    const isCollapsed = DOM.sidebar?.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
  });

  DOM.btnNewReport?.addEventListener('click', (e) => {
    e.stopPropagation();
    showScreen('welcome');
    history.pushState({ type: 'welcome' }, '', window.location.pathname);

    const input = document.getElementById('welcomeSearchInput');
    const panel = document.getElementById('welcomeSearchPanel');
    if (input) {
      input.value = '';
      input.focus();
    }
    if (panel) {
      panel.classList.add('active');
    }
  });

  DOM.btnMinimizeProgress?.addEventListener('click', () => {
    showScreen('welcome');
    history.pushState({ type: 'welcome' }, '', window.location.pathname);
    document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
  });

  const handleBackToWelcome = () => {
    showScreen('welcome');
    history.pushState({ type: 'welcome' }, '', window.location.pathname);
    document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
  };

  DOM.absoluteBack?.addEventListener('click', handleBackToWelcome);

  // Обработка кнопки Наверх
  const mainContent = document.getElementById('mainContent');
  if (mainContent && DOM.btnScrollTop) {
    mainContent.addEventListener('scroll', () => {
      if (mainContent.scrollTop > 300) {
        DOM.btnScrollTop.classList.add('visible');
      } else {
        DOM.btnScrollTop.classList.remove('visible');
      }
    });

    DOM.btnScrollTop.addEventListener('click', () => {
      mainContent.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
  window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (state && state.type === 'report') {
      loadReportById(state.id, true);
    } else {
      showScreen('welcome');
      document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
    }
  });

  const welcomeSearchForm = document.getElementById('welcomeSearchForm');
  welcomeSearchForm?.addEventListener('submit', handleFormSubmit);

  DOM.currencyBtns?.forEach((btn) => {
    btn.addEventListener('click', () => {
      appStore.setState({ currentCurrency: btn.dataset.currency });
      DOM.currencyBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const { currentReport } = appStore.getState();
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