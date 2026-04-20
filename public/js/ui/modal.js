import { DOM } from '../dom.js';
import { loadSettings } from '../utils/settings.js';
import { showScreen } from './common.js';

export function openModal() {
  if(DOM.modalOverlay) DOM.modalOverlay.style.display = 'flex';
  if(DOM.inputQuery) DOM.inputQuery.focus();
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

  if (!query) return;

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
      alert(`Ошибка: ${data.error}`);
    }
  } catch (error) {
    console.error('[App] ❌ Ошибка отправки запроса:', error);
    alert('Ошибка сети. Проверьте подключение к серверу.');
  } finally {
    DOM.btnSubmitParse.disabled = false;
    DOM.btnSubmitParse.textContent = '🚀 Запустить сбор';
  }
}
