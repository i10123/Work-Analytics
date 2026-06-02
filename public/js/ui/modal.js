import { DOM } from '../dom.js';
import { loadSettings } from '../utils/settings.js';
import { showScreen } from './common.js';
import { validateForm, showValidationTooltip } from './ui-premium.js';
import { loadQueueUI } from './sidebar.js';
import { clientId } from '../state.js';



// Обработка отправки формы поискового запроса и запуск парсинга
export async function handleFormSubmit(e) {
  if (e) e.preventDefault();

  const queryInput = document.getElementById('welcomeSearchInput');
  const query = queryInput ? queryInput.value.trim() : '';

  if (!query) {
    if (queryInput) {
      queryInput.value = '';
      showValidationTooltip(queryInput);
      queryInput.focus();
    }
    return;
  }

  const periodEl = document.querySelector('input[name="welcomePeriod"]:checked');
  const period = periodEl ? periodEl.value : '7days';

  const limitInput = document.getElementById('welcomeInputLimit');
  const limit = limitInput ? parseInt(limitInput.value, 10) || 50 : 50;
  
  const settings = loadSettings();

  const parseSourceHH = document.getElementById('welcomeSourceHH');
  const parseSourceRabotaby = document.getElementById('welcomeSourceRabotaby');
  const parseSourceHabr = document.getElementById('welcomeSourceHabr');
  const parseDeepScrape = document.getElementById('welcomeDeepScrape');

  const parseSources = {
    hh: parseSourceHH ? parseSourceHH.checked : true,
    rabotaby: parseSourceRabotaby ? parseSourceRabotaby.checked : true,
    habr: parseSourceHabr ? parseSourceHabr.checked : true
  };

  if (!parseSources.hh && !parseSources.rabotaby && !parseSources.habr) {
    showErrorModal('Ошибка', 'Выберите хотя бы один источник для парсинга.');
    return;
  }

  const isDeepScrape = parseDeepScrape ? parseDeepScrape.checked : false;

  const form = document.getElementById('welcomeSearchForm');
  if (form && !validateForm(form)) return;

  const submitBtn = document.getElementById('welcomeSearchSubmit');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="spinner-icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke="var(--glass-border)" stroke-width="3"></circle>
        <path d="M12 2 C 6.48 2 2 6.48 2 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
      </svg>
    `;
  }

  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, period, limit, sources: parseSources, stopWords: settings.stopWords, deepScrape: isDeepScrape, clientId }),
    });

    const data = await response.json();

    if (data.success) {
      console.log(`[App] ✅ Задача создана: ${data.task.id}`);
      
      const panel = document.getElementById('welcomeSearchPanel');
      if (panel) panel.classList.remove('active');
      
      showScreen('progress');

      if (DOM.progressTitle) DOM.progressTitle.textContent = `Сбор данных: "${query}"`;
      if (DOM.progressStep) DOM.progressStep.textContent = 'Задача добавлена в очередь...';
      loadQueueUI();
    } else {
      console.warn('[App] ⚠️ Ошибка запуска сбора:', data.error);
      showErrorModal('Ошибка запуска', data.error);
    }
  } catch (error) {
    console.error('[App] ❌ Ошибка отправки запроса:', error);
    showErrorModal('Ошибка сети', 'Не удалось связаться с сервером. Проверьте интернет-соединение.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}

// Отображение модального окна с ошибкой (через системные уведомления-тосты)
export function showErrorModal(title, text) {
  import('./common.js').then(({ showToast }) => {
    showToast(`${title}: ${text}`, 'error');
  });
}
