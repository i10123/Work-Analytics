import { DOM } from '../dom.js';
import { loadSettings } from '../utils/settings.js';
import { showScreen } from './common.js';
import { validateForm } from './ui-premium.js';

export function openModal() {
  const settings = loadSettings();
  
  if (DOM.inputQuery) {
    DOM.inputQuery.value = '';
    DOM.inputQuery.focus();
  }
  
  if (DOM.selectPeriod) {
    DOM.selectPeriod.value = settings.defaultPeriod;
    // Обновляем визуальное состояние сегментированного контроля
    const control = document.getElementById('controlPeriod');
    if (control) {
      const btns = control.querySelectorAll('.segmented-control__btn');
      btns.forEach(b => b.classList.toggle('active', b.dataset.value === settings.defaultPeriod));
    }
  }
  
  if (DOM.inputLimit) {
    DOM.inputLimit.value = settings.defaultLimit;
  }

  if(DOM.modalOverlay) DOM.modalOverlay.style.display = 'flex';
}

export function closeModal() {
  if(DOM.modalOverlay) DOM.modalOverlay.style.display = 'none';
}

export async function handleFormSubmit(e) {
  e.preventDefault();

  const query = DOM.inputQuery.value.trim();
  const period = DOM.selectPeriod.value;
  const limit = parseInt(DOM.inputLimit.value, 10) || 50;
  const settings = loadSettings();

  if (!validateForm(e.target)) return;

  DOM.btnSubmitParse.disabled = true;
  DOM.btnSubmitParse.textContent = '⏳ Отправка...';

  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, period, limit, sources: settings.sources }),
    });

    const data = await response.json();

    if (data.success) {
      console.log(`[App] ✅ Задача создана: ${data.task.id}`);
      closeModal();
      showScreen('progress');
      
      if(DOM.progressTitle) DOM.progressTitle.textContent = `Сбор данных: "${query}"`;
      if(DOM.progressStep) DOM.progressStep.textContent = 'Задача добавлена в очередь...';
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

/**
 * Показывает тематическое окно ошибки.
 * @param {string} title — Заголовок.
 * @param {string} text — Описание ошибки.
 */
export function showErrorModal(title, text) {
  if (!DOM.errorModalOverlay || !DOM.errorTitle || !DOM.errorText) return;

  DOM.errorTitle.textContent = title;
  DOM.errorText.textContent = text;
  DOM.errorModalOverlay.style.display = 'flex';

  const closeFn = () => {
    DOM.errorModalOverlay.style.display = 'none';
    DOM.btnErrorOk.removeEventListener('click', closeFn);
  };

  DOM.btnErrorOk.addEventListener('click', closeFn);
}
