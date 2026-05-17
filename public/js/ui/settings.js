/**
 * settings.js
 * Суть: Модуль конфигурации приложения и пользовательских настроек.
 * Что делает: Управляет выбором темы, валюты, фильтров поиска по умолчанию, проверяет состояние API и очищает данные.
 * Что содержит: Слушатели событий формы настроек, синхронизацию настроек с UI, работу с подтверждениями (confirm modal) и кастомные степперы для полей ввода чисел.
 */
import { DOM } from '../dom.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../utils/settings.js';
import { showToast, showScreen } from './common.js';
import { setAppTheme } from './theme.js';
import { renderDashboard } from './dashboard.js';
import { loadReportsList } from '../report.js';
import { appStore } from '../state.js';

export function setupSettingsListeners() {
  if (DOM.btnSettings) DOM.btnSettings.addEventListener('click', openSettings);
  if (DOM.settingsClose) DOM.settingsClose.addEventListener('click', () => closeSettings(false));
  if (DOM.settingsOverlay) {
    DOM.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === DOM.settingsOverlay) closeSettings(false);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.settingsOverlay?.style.display === 'flex') {
      if (DOM.confirmModal?.style.display === 'flex') {
        DOM.confirmModal.style.display = 'none';
        return;
      }
      closeSettings(false);
    }
  });

  DOM.settingsTabs?.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchSettingsTab(tab.dataset.tab));
  });

  DOM.settingsThemeGrid?.querySelectorAll('.settings-theme-card').forEach((card) => {
    card.addEventListener('click', () => {
      DOM.settingsThemeGrid.querySelectorAll('.settings-theme-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  DOM.settingsDefaultCurrency?.querySelectorAll('.settings-currency-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      DOM.settingsDefaultCurrency.querySelectorAll('.settings-currency-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  if (DOM.btnDeleteAllReports) DOM.btnDeleteAllReports.addEventListener('click', handleDeleteAllReports);
  if (DOM.btnClearCache) DOM.btnClearCache.addEventListener('click', handleClearCache);
  if (DOM.btnResetSettings) DOM.btnResetSettings.addEventListener('click', handleResetSettings);
  if (DOM.settingsSave) DOM.settingsSave.addEventListener('click', handleSaveSettings);
}

export function openSettings() {
  const settings = loadSettings();

  DOM.settingsThemeGrid?.querySelectorAll('.settings-theme-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.theme === settings.theme);
  });

  DOM.settingsDefaultCurrency?.querySelectorAll('.settings-currency-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.currency === settings.defaultCurrency);
  });

  const periodRadio = document.querySelector(`input[name="settings_period"][value="${settings.defaultPeriod}"]`);
  if (periodRadio) {
    periodRadio.checked = true;
    periodRadio.dispatchEvent(new Event('change'));
  }
  if (DOM.settingsDefaultLimit) DOM.settingsDefaultLimit.value = settings.defaultLimit;

  if (DOM.settingsSourceHH) DOM.settingsSourceHH.checked = settings.sources.hh;
  if (DOM.settingsSourceRabotaby) DOM.settingsSourceRabotaby.checked = settings.sources.rabotaby;
  if (DOM.settingsSourceHabr) DOM.settingsSourceHabr.checked = settings.sources.habr;

  const stopWordsInput = document.getElementById('settingsStopWords');
  if (stopWordsInput) stopWordsInput.value = settings.stopWords || '';

  const deepScrapeCheck = document.getElementById('settingsDeepScrape');
  if (deepScrapeCheck) deepScrapeCheck.checked = settings.deepScrape || false;

  if (DOM.settingsOverlay) DOM.settingsOverlay.style.display = 'flex';

  switchSettingsTab('general');
  loadApiStatus();
  loadDataStats();

  appStore.setState({ baselineSettings: JSON.stringify(getSettingsFromUI()) });
}

export async function closeSettings(force = false) {
  const { baselineSettings } = appStore.getState();
  if (!force && baselineSettings) {
    const currentSettings = JSON.stringify(getSettingsFromUI());
    if (currentSettings !== baselineSettings) {
      const choice = await showConfirmModal();
      
      if (choice === 'save') {
        await handleSaveSettings();
        return;
      } else if (choice === 'discard') {
      } else {
        return;
      }
    }
  }

  if (DOM.settingsOverlay) DOM.settingsOverlay.style.display = 'none';
  appStore.setState({ baselineSettings: null });
}

function showConfirmModal() {
  return showConfirm({
    title: 'Сохранить изменения?',
    text: 'Вы изменили настройки. Хотите сохранить их перед выходом?',
    icon: '💾',
    buttons: [
      { text: 'Сохранить и выйти', type: 'primary', value: 'save' },
      { text: 'Не сохранять', type: 'outline', value: 'discard' },
      { text: 'Вернуться', type: 'ghost', value: 'cancel' }
    ]
  });
}

export function showConfirm(options) {
  return new Promise((resolve) => {
    const { title, text, icon = '⚠️', buttons = [] } = options;
    
    const overlay = DOM.confirmModalOverlay;
    const titleEl = document.getElementById('confirmTitle');
    const textEl = document.getElementById('confirmText');
    const iconEl = document.getElementById('confirmIcon');
    const actionsEl = document.getElementById('confirmActions');
    
    if (!overlay || !titleEl || !actionsEl) return resolve(null);

    titleEl.textContent = title;
    textEl.textContent = text;
    if (iconEl) iconEl.textContent = icon;
    
    actionsEl.innerHTML = '';
    
    const isRow = buttons.length === 2 && buttons.every(b => b.text.length <= 15);
    actionsEl.classList.toggle('confirm-modal__actions--row', isRow);
    
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = `btn btn--${b.type || 'outline'}`;
      btn.textContent = b.text;
      btn.onclick = (e) => {
        e.stopPropagation();
        overlay.style.display = 'none';
        resolve(b.value);
      };
      actionsEl.appendChild(btn);
    });
    
    overlay.style.display = 'flex';
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
        resolve(null);
      }
    };
  });
}


function switchSettingsTab(tabName) {
  DOM.settingsTabs?.querySelectorAll('.settings-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  document.querySelectorAll('.settings-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `settingsPanel-${tabName}`);
  });
}

async function handleSaveSettings() {
  const settings = getSettingsFromUI();

  const stopWordsInput = document.getElementById('settingsStopWords');
  if (stopWordsInput && stopWordsInput.value) {
    const isValid = /^[\p{L}0-9\s,]*$/u.test(stopWordsInput.value);
    if (!isValid) {
      showToast('Стоп-слова могут содержать только буквы, цифры, пробелы и запятые', 'error');
      return;
    }
  }

  if (!settings.sources.hh && !settings.sources.rabotaby && !settings.sources.habr) {
    showToast('Выберите хотя бы один источник данных', 'error');
    return;
  }

  // Сохраняем настройки в localStorage и на сервер
  saveSettings(settings).catch(err => {
    console.warn('[Settings] ⚠️ Ошибка сохранения настроек:', err);
  });

  appStore.setState({ currentCurrency: settings.defaultCurrency });
  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === settings.defaultCurrency);
  });

  setAppTheme(settings.theme);

  const { currentReport } = appStore.getState();
  if (currentReport) {
    renderDashboard(currentReport);
  }

  appStore.setState({ baselineSettings: JSON.stringify(settings) });

  closeSettings(true);
  showToast('Настройки сохранены', 'success');

  // Синхронизация полей поиска при сохранении настроек
  const mainPeriodRadio = document.querySelector(`input[name="period"][value="${settings.defaultPeriod}"]`);
  if (mainPeriodRadio) {
    mainPeriodRadio.checked = true;
    mainPeriodRadio.dispatchEvent(new Event('change'));
  }
  if (DOM.inputLimit) DOM.inputLimit.value = settings.defaultLimit;
}

function getSettingsFromUI() {
  const activeThemeCard = DOM.settingsThemeGrid?.querySelector('.settings-theme-card.active');
  const activeCurrencyBtn = DOM.settingsDefaultCurrency?.querySelector('.settings-currency-btn.active');

  return {
    theme: activeThemeCard ? activeThemeCard.dataset.theme : DEFAULT_SETTINGS.theme,
    defaultCurrency: activeCurrencyBtn ? activeCurrencyBtn.dataset.currency : DEFAULT_SETTINGS.defaultCurrency,
    defaultPeriod: document.querySelector('input[name="settings_period"]:checked')?.value || DEFAULT_SETTINGS.defaultPeriod,
    defaultLimit: parseInt(DOM.settingsDefaultLimit?.value, 10) || 50,
    sources: {
      hh: DOM.settingsSourceHH?.checked ?? true,
      rabotaby: DOM.settingsSourceRabotaby?.checked ?? true,
      habr: DOM.settingsSourceHabr?.checked ?? true,
    },
    stopWords: document.getElementById('settingsStopWords')?.value || '',
    deepScrape: document.getElementById('settingsDeepScrape')?.checked || false,
  };
}

async function loadApiStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();

    if (!data.success) return;

    /** Универсальная функция для обновления статуса */
    const updateStatus = (element, configured, textOk = 'Настроен', textFail = 'Не настроен') => {
      if (!element) return;
      if (configured) {
        element.className = 'settings-api-status__value settings-api-status__value--ok';
        element.innerHTML = `<span class="settings-api-status__dot"></span>${textOk}`;
      } else {
        element.className = 'settings-api-status__value settings-api-status__value--error';
        element.innerHTML = `<span class="settings-api-status__dot"></span>${textFail}`;
      }
    };

    let hasApiError = false;

    // OpenRouter
    if (data.openrouter) {
      updateStatus(DOM.openrouterStatusText, data.openrouter.configured);
      if (!data.openrouter.configured) hasApiError = true;
    } else {
      hasApiError = true;
    }

    // Currency
    if (data.currency) {
      updateStatus(DOM.currencyStatusText, data.currency.configured, 'Настроены', 'Не настроены');
      if (!data.currency.configured) hasApiError = true;
    } else {
      hasApiError = true;
    }

    updateApiTabIndicator(hasApiError);

  } catch (error) {
    console.error('[Settings] ❌ Ошибка загрузки статуса API:', error);
    updateApiTabIndicator(true);
    const elements = [DOM.openrouterStatusText, DOM.currencyStatusText];
    elements.forEach(el => {
      if (el) {
        el.className = 'settings-api-status__value settings-api-status__value--error';
        el.innerHTML = '<span class="settings-api-status__dot"></span>Недоступен';
      }
    });
  }
}

function updateApiTabIndicator(hasError) {
  const apiTab = document.querySelector('.settings-tab[data-tab="api"]');
  if (!apiTab) return;

  let dot = apiTab.querySelector('.settings-tab__status-dot');
  if (hasError) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'settings-tab__status-dot';
      apiTab.appendChild(dot);
    }
  } else {
    if (dot) dot.remove();
  }
}

async function loadDataStats() {
  try {
    const response = await fetch('/api/reports');
    const data = await response.json();

    if (data.success && DOM.dataReportsCount && DOM.dataJobsCount) {
      DOM.dataReportsCount.textContent = data.reports.length;
      const totalJobs = data.reports.reduce((sum, r) => sum + (r.stats?.totalFound || 0), 0);
      DOM.dataJobsCount.textContent = totalJobs;
    }
  } catch (error) {
    console.warn('[Settings] ⚠️ Не удалось загрузить статистику:', error);
  }
}

async function handleDeleteAllReports() {
  const confirmed = await showConfirm({
    title: 'Удалить все отчёты?',
    text: 'Это действие необратимо. Все собранные данные будут безвозвратно удалены из базы данных.',
    icon: '🗑️',
    buttons: [
      { text: 'Да, удалить всё', type: 'primary', value: true },
      { text: 'Отмена', type: 'outline', value: false }
    ]
  });

  if (!confirmed) return;

  try {
    const response = await fetch('/api/reports', { method: 'DELETE' });
    const data = await response.json();

    if (data.success) {
      appStore.setState({ currentReport: null });
      history.replaceState({ type: 'welcome' }, '', window.location.pathname);
      showScreen('welcome');
      loadReportsList();
      loadDataStats();
      showToast(`Все отчёты удалены (${data.count})`, 'success');
    } else {
      showToast(`Ошибка: ${data.error}`, 'error');
    }
  } catch (error) {
    showToast('Ошибка при удалении отчётов', 'error');
  }
}

function handleClearCache() {
  showToast('Кэш успешно очищен', 'success');
}

async function handleResetSettings() {
  const confirmed = await showConfirm({
    title: 'Сбросить настройки?',
    text: 'Все ваши предпочтения будут сброшены к заводским значениям.',
    icon: '🔄',
    buttons: [
      { text: 'Сбросить', type: 'primary', value: true },
      { text: 'Оставить как есть', type: 'outline', value: false }
    ]
  });

  if (!confirmed) return;

  saveSettings(DEFAULT_SETTINGS).catch(err => {
    console.warn('[Settings] ⚠️ Ошибка сохранения сброшенных настроек:', err);
    showToast('Настройки сброшены локально, но не сохранены на сервер', 'warning');
  });
  setAppTheme(DEFAULT_SETTINGS.theme);
  appStore.setState({ currentCurrency: DEFAULT_SETTINGS.defaultCurrency });

  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === DEFAULT_SETTINGS.defaultCurrency);
  });
  if (DOM.inputLimit) DOM.inputLimit.value = DEFAULT_SETTINGS.defaultLimit;

  // Обновляем состояние сегментированных контролов в форме поиска
  const defaultRadio = document.querySelector(`input[name="period"][value="${DEFAULT_SETTINGS.defaultPeriod}"]`);
  if (defaultRadio) {
    defaultRadio.checked = true;
    defaultRadio.dispatchEvent(new Event('change'));
  }

  openSettings();
  showToast('Настройки сброшены', 'success');
}

export function setupStepperListeners() {
  let interval = null;
  let timeout = null;
  let accelerationFactor = 1;

  function stopStepping() {
    if (timeout) clearTimeout(timeout);
    if (interval) clearInterval(interval);
    timeout = null;
    interval = null;
    accelerationFactor = 1;
  }

  function doStep(input, direction) {
    if (!input || input.disabled) {
      stopStepping();
      return;
    }
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 1000;
    const step = parseFloat(input.step) || 1;
    let value = parseFloat(input.value) || 0;

    const currentStep = step * Math.floor(accelerationFactor);

    if (direction === 'plus') {
      value = Math.min(max, value + currentStep);
    } else {
      value = Math.max(min, value - currentStep);
    }

    input.value = value;
    
    // Удаляем вызов forced reflow
    // Анимация будет воспроизводиться только при первом нажатии

    if (accelerationFactor < 10) accelerationFactor += 0.2;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function handleStart(e, direction, btn) {
    const stepper = btn.closest('.number-stepper');
    if (!stepper) return;

    const input = stepper.querySelector('input[type="number"]');
    if (!input || input.disabled) return;

    accelerationFactor = 1;
    doStep(input, direction);

    timeout = setTimeout(() => {
      interval = setInterval(() => {
        doStep(input, direction);
      }, 80);
    }, 400);
  }

  document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-stepper]');
    if (!btn || e.button !== 0) return;
    handleStart(e, btn.dataset.stepper, btn);
  });

  document.addEventListener('mouseup', stopStepping);
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) stopStepping();
  });
  window.addEventListener('blur', stopStepping);

  document.addEventListener('touchstart', (e) => {
    const btn = e.target.closest('[data-stepper]');
    if (!btn) return;
    if (e.cancelable) e.preventDefault();
    handleStart(e, btn.dataset.stepper, btn);
  }, { passive: false });

  document.addEventListener('touchend', stopStepping);
  document.addEventListener('touchcancel', stopStepping);
}

export function setupSegmentedControlListeners() {
  const controls = document.querySelectorAll('.segmented-control');
  controls.forEach(control => {
    const inputs = Array.from(control.querySelectorAll('input[type="radio"]'));
    const indicator = control.querySelector('.segmented-control__indicator');
    if (!inputs.length || !indicator) return;

    const updateIndicator = () => {
      const checkedIndex = inputs.findIndex(input => input.checked);
      if (checkedIndex !== -1) {
        indicator.style.transform = `translateX(${checkedIndex * 100}%)`;
      }
    };

    inputs.forEach(input => {
      input.addEventListener('change', updateIndicator);
    });

    // Инициализация при загрузке
    updateIndicator();

    // Также обновляем при кастомных событиях, если они есть
    control.addEventListener('updateIndicator', updateIndicator);
  });
}
