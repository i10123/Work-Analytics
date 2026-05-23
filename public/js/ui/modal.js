
import { DOM } from '../dom.js';
import { loadSettings } from '../utils/settings.js';
import { showScreen } from './common.js';
import { validateForm, showValidationTooltip } from './ui-premium.js';
import { loadQueueUI } from './sidebar.js';
import { clientId } from '../state.js';

export function openModal(prefillQuery) {
  const settings = loadSettings();

  if (DOM.inputQuery) {
    DOM.inputQuery.value = typeof prefillQuery === 'string' ? prefillQuery : '';
    DOM.inputQuery.focus();
  }

  const periodRadio = document.querySelector(`input[name="period"][value="${settings.defaultPeriod}"]`);
  if (periodRadio) {
    periodRadio.checked = true;
  }

  if (DOM.inputLimit) {
    DOM.inputLimit.value = settings.defaultLimit;
  }

  if (DOM.parseSourceHH) DOM.parseSourceHH.checked = settings.sources?.hh !== false;
  if (DOM.parseSourceRabotaby) DOM.parseSourceRabotaby.checked = settings.sources?.rabotaby !== false;
  if (DOM.parseSourceHabr) DOM.parseSourceHabr.checked = settings.sources?.habr !== false;
  if (DOM.parseDeepScrape) DOM.parseDeepScrape.checked = settings.deepScrape;

  if (DOM.modalOverlay) DOM.modalOverlay.style.display = 'flex';
}

export function closeModal() {
  if (DOM.modalOverlay) DOM.modalOverlay.style.display = 'none';
}

export async function handleFormSubmit(e) {
  e.preventDefault();

  const query = DOM.inputQuery.value.trim();

  if (!query) {
    DOM.inputQuery.value = '';
    showValidationTooltip(DOM.inputQuery);
    DOM.inputQuery.focus();
    return;
  }

  const periodEl = document.querySelector('input[name="period"]:checked');
  const period = periodEl ? periodEl.value : '7days';
  const limit = parseInt(DOM.inputLimit.value, 10) || 50;
  const settings = loadSettings();

  const parseSources = {
    hh: DOM.parseSourceHH ? DOM.parseSourceHH.checked : true,
    rabotaby: DOM.parseSourceRabotaby ? DOM.parseSourceRabotaby.checked : true,
    habr: DOM.parseSourceHabr ? DOM.parseSourceHabr.checked : true
  };

  if (!parseSources.hh && !parseSources.rabotaby && !parseSources.habr) {
    showErrorModal('Ошибка', 'Выберите хотя бы один источник для парсинга.');
    return;
  }

  const parseDeepScrape = DOM.parseDeepScrape ? DOM.parseDeepScrape.checked : settings.deepScrape;

  if (!validateForm(e.target)) return;

  DOM.btnSubmitParse.disabled = true;
  DOM.btnSubmitParse.textContent = '⏳ Отправка...';

  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, period, limit, sources: parseSources, stopWords: settings.stopWords, deepScrape: parseDeepScrape, clientId }),
    });

    const data = await response.json();

    if (data.success) {
      console.log(`[App] ✅ Задача создана: ${data.task.id}`);
      closeModal();
      showScreen('progress');

      if (DOM.progressTitle) DOM.progressTitle.textContent = `Сбор данных: "${query}"`;
      if (DOM.progressStep) DOM.progressStep.textContent = 'Задача добавлена в очередь...';
      loadQueueUI();
    } else {
      showErrorModal('Ошибка запуска', data.error);
    }
  } catch (error) {
    console.error('[App] ❌ Ошибка отправки запроса:', error);
    showErrorModal('Ошибка сети', 'Не удалось связаться с сервером. Проверьте интернет-соединение.');
  } finally {
    DOM.btnSubmitParse.disabled = false;
    DOM.btnSubmitParse.textContent = '🚀 Запустить сбор';
  }
}

export function showErrorModal(title, text) {
  import('./common.js').then(({ showToast }) => {
    showToast(`${title}: ${text}`, 'error');
  });
}
