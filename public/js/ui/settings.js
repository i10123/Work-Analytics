import { DOM } from '../dom.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../utils/settings.js';
import { showToast, showScreen } from './common.js';
import { setAppTheme } from './theme.js';
import { renderDashboard } from './dashboard.js';
import { loadReportsList } from '../api.js';
import { currentReport, setCurrentReport, currentCurrency, setCurrentCurrency, baselineSettings, setBaselineSettings } from '../state.js';

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

  if (DOM.settingsDefaultPeriod) DOM.settingsDefaultPeriod.value = settings.defaultPeriod;
  if (DOM.settingsDefaultLimit) DOM.settingsDefaultLimit.value = settings.defaultLimit;

  if (DOM.settingsSourceHH) DOM.settingsSourceHH.checked = settings.sources.hh;
  if (DOM.settingsSourceRabotaby) DOM.settingsSourceRabotaby.checked = settings.sources.rabotaby;
  if (DOM.settingsSourceHabr) DOM.settingsSourceHabr.checked = settings.sources.habr;

  if (DOM.settingsOverlay) DOM.settingsOverlay.style.display = 'flex';

  switchSettingsTab('general');
  loadApiStatus();
  loadDataStats();

  setBaselineSettings(JSON.stringify(getSettingsFromUI()));
}

export async function closeSettings(force = false) {
  if (!force && baselineSettings) {
    const currentSettings = JSON.stringify(getSettingsFromUI());
    if (currentSettings !== baselineSettings) {
      const choice = await showConfirmModal();
      
      if (choice === 'save') {
        handleSaveSettings();
        return;
      } else if (choice === 'discard') {
      } else {
        return;
      }
    }
  }

  if (DOM.settingsOverlay) DOM.settingsOverlay.style.display = 'none';
  setBaselineSettings(null);
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

function showConfirm(options) {
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

function handleSaveSettings() {
  const settings = getSettingsFromUI();

  if (!settings.sources.hh && !settings.sources.rabotaby && !settings.sources.habr) {
    showToast('Выберите хотя бы один источник данных', 'error');
    return;
  }

  saveSettings(settings);

  setCurrentCurrency(settings.defaultCurrency);
  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === currentCurrency);
  });

  setAppTheme(settings.theme);

  if (currentReport) {
    renderDashboard(currentReport);
  }

  setBaselineSettings(JSON.stringify(settings));

  closeSettings(true);
  showToast('Настройки сохранены', 'success');

  // Синхронизация полей поиска при сохранении настроек
  if (DOM.selectPeriod) {
    DOM.selectPeriod.value = settings.defaultPeriod;
    const control = document.getElementById('controlPeriod');
    if (control) {
      const btns = control.querySelectorAll('.segmented-control__btn');
      btns.forEach(b => b.classList.toggle('active', b.dataset.value === settings.defaultPeriod));
    }
  }
  if (DOM.inputLimit) DOM.inputLimit.value = settings.defaultLimit;
}

function getSettingsFromUI() {
  const activeThemeCard = DOM.settingsThemeGrid?.querySelector('.settings-theme-card.active');
  const activeCurrencyBtn = DOM.settingsDefaultCurrency?.querySelector('.settings-currency-btn.active');

  return {
    theme: activeThemeCard ? activeThemeCard.dataset.theme : DEFAULT_SETTINGS.theme,
    defaultCurrency: activeCurrencyBtn ? activeCurrencyBtn.dataset.currency : DEFAULT_SETTINGS.defaultCurrency,
    defaultPeriod: DOM.settingsDefaultPeriod?.value || DEFAULT_SETTINGS.defaultPeriod,
    defaultLimit: parseInt(DOM.settingsDefaultLimit?.value, 10) || 50,
    sources: {
      hh: DOM.settingsSourceHH?.checked ?? true,
      rabotaby: DOM.settingsSourceRabotaby?.checked ?? true,
      habr: DOM.settingsSourceHabr?.checked ?? true,
    },
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

    /** Универсальная функция для рендеринга списка ключей */
    const renderKeys = (container, row, keys) => {
      if (!container || !row) return;
      if (keys && keys.length > 0) {
        container.innerHTML = keys.map(k => `<span class="settings-api-status__key-tag">${k}</span>`).join('');
        row.style.display = 'flex';
      } else {
        row.style.display = 'none';
      }
    };

    // OpenRouter
    if (data.openrouter) {
      updateStatus(DOM.dashscopeStatusText, data.openrouter.configured);
      if (DOM.dashscopeKeyText && DOM.dashscopeKeyRow) {
        if (data.openrouter.configured) {
          DOM.dashscopeKeyText.textContent = data.openrouter.key;
          DOM.dashscopeKeyRow.style.display = 'flex';
        } else {
          DOM.dashscopeKeyRow.style.display = 'none';
        }
      }
    }

    // Currency
    if (data.currency) {
      updateStatus(DOM.currencyStatusText, data.currency.configured);
      renderKeys(DOM.currencyKeysList, DOM.currencyKeysRow, data.currency.keys);
    }

  } catch (error) {
    console.error('[Settings] ❌ Ошибка загрузки статуса API:', error);
    const elements = [DOM.dashscopeStatusText, DOM.currencyStatusText];
    elements.forEach(el => {
      if (el) {
        el.className = 'settings-api-status__value settings-api-status__value--error';
        el.innerHTML = '<span class="settings-api-status__dot"></span>Недоступен';
      }
    });
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
    text: 'Это действие необратимо. Все собранные данные будут безвозвратно удалены из базе данных.',
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
      setCurrentReport(null);
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

  saveSettings(DEFAULT_SETTINGS);
  setAppTheme(DEFAULT_SETTINGS.theme);
  setCurrentCurrency(DEFAULT_SETTINGS.defaultCurrency);

  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === DEFAULT_SETTINGS.defaultCurrency);
  });
  if (DOM.inputLimit) DOM.inputLimit.value = DEFAULT_SETTINGS.defaultLimit;

  // Обновляем состояние сегментированных контролов в форме поиска
  const control = document.getElementById('controlPeriod');
  if (control) {
    const btns = control.querySelectorAll('.segmented-control__btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.value === DEFAULT_SETTINGS.defaultPeriod));
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
    
    const container = input.closest('.number-stepper');
    if (container) {
      container.classList.remove('pulse');
      void container.offsetWidth;
      container.classList.add('pulse');
    }

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
  document.addEventListener('mouseleave', stopStepping);

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
    const buttons = control.querySelectorAll('.segmented-control__btn');
    const containerId = control.id;
    
    let targetSelect = null;
    if (containerId === 'controlPeriod') targetSelect = DOM.selectPeriod;
    if (containerId === 'settingsControlPeriod') targetSelect = DOM.settingsDefaultPeriod;

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;
        
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (targetSelect) {
          targetSelect.value = val;
          targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    if (targetSelect) {
      const initialVal = targetSelect.value;
      const initialBtn = control.querySelector(`[data-value="${initialVal}"]`);
      if (initialBtn) {
        buttons.forEach(b => b.classList.remove('active'));
        initialBtn.classList.add('active');
      }
    }
  });
}
