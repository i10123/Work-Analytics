import { DOM } from './dom.js';
import { initializeTheme } from './ui/theme.js';
import { loadSettings } from './utils/settings.js';
import { setCurrentCurrency, currentReport } from './state.js';
import { loadReportsList, loadReportById } from './api.js';
import { setupSSE } from './ui/sse.js';
import { openModal, closeModal, handleFormSubmit } from './ui/modal.js';
import { renderDashboard } from './ui/dashboard.js';
import { showScreen } from './ui/common.js';
import { setupSidebarListeners, loadQueueUI } from './ui/sidebar.js';
import { setupSettingsListeners, setupStepperListeners, setupSegmentedControlListeners } from './ui/settings.js';
import { initializePremiumUI } from './ui/ui-premium.js';
import { setupWelcomeScreen, updateWelcomeStats } from './ui/welcome.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] 🚀 Инициализация Work Analytics (Modular)...');

  initializeTheme();

  initializeSettings();
  initializePremiumUI();
  setupEventListeners();
  setupSSE();
  setupWelcomeScreen();
  
  let isRestoredProgress = false;

  // F5-синхронизация: подхватываем текущий прогресс очереди
  try {
    const queueRes = await fetch('/api/queue');
    const queueData = await queueRes.json();
    if (queueData.success && queueData.currentTask && queueData.currentTask.status === 'processing') {
      console.log('[App] 🔄 Обнаружена активная задача после F5:', queueData.currentTask.id);
      showScreen('progress');
      if (DOM.progressTitle) DOM.progressTitle.textContent = `Сбор данных: "${queueData.currentTask.query || ''}"`;
      isRestoredProgress = true;
    }
  } catch (e) {
    console.warn('[App] ⚠️ Не удалось проверить состояние очереди:', e.message);
  }

  // Загружаем список отчётов
  await loadReportsList();
  updateWelcomeStats();
  
  // Загружаем UI очереди
  await loadQueueUI();
  
  // Обработка начального состояния (URL хеш)
  if (!isRestoredProgress) {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#report=')) {
      const reportId = hash.replace('#report=', '');
      loadReportById(reportId, true);
    } else {
      showScreen('welcome');
      // Заменяем текущее состояние в истории на 'welcome'
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
  if (DOM.selectPeriod) DOM.selectPeriod.value = settings.defaultPeriod;
  if (DOM.inputLimit) DOM.inputLimit.value = settings.defaultLimit;
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

  // Сворачиваем логи по умолчанию при загрузке
  if (DOM.sidebarLogs) DOM.sidebarLogs.classList.add('collapsed');
}
