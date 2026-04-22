import { DOM } from '../dom.js';
import { showScreen } from './common.js';
import { loadReportById, loadReportsList } from '../api.js';
import { addLogEntry } from './sidebar.js';
import { showErrorModal } from './modal.js';

export function setupSSE() {
  console.log('[App] 📡 Подключение к SSE...');
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('taskUpdate', (event) => {
    const task = JSON.parse(event.data);
    console.log(`[App] 📡 SSE taskUpdate:`, task);
    handleTaskUpdate(task);
  });

  eventSource.addEventListener('queueStatus', (event) => {
    const status = JSON.parse(event.data);
    updateQueueBadge(status);
  });

  eventSource.onerror = () => {
    console.warn('[App] ⚠️ SSE-соединение потеряно. Переподключение...');
  };
}

function handleTaskUpdate(task) {
  if (task.status === 'processing') {
    showScreen('progress');
    if (DOM.progressTitle) DOM.progressTitle.textContent = `Сбор данных: "${task.query || ''}"`;
    if (task.step && DOM.progressStep) {
      DOM.progressStep.textContent = task.step;
      addLogEntry(task.step, 'info');
    }
  } else if (task.status === 'completed' || task.status === 'partial') {
    const msg = task.status === 'completed' ? 'Сбор успешно завершен' : 'Сбор завершен с ошибками некоторых источников';
    addLogEntry(`${msg}: ${task.query}`, task.status === 'completed' ? 'success' : 'warning');
    
    if (task.reportId) {
      loadReportById(task.reportId);
    }
    loadReportsList();
  } else if (task.status === 'failed') {
    showScreen('welcome');
    addLogEntry(`Ошибка: ${task.error || 'Неизвестная ошибка'}`, 'error');
    showErrorModal('Ошибка сбора данных', task.error || 'Неизвестная ошибка сервера.');
    loadReportsList();
  } else if (task.status === 'pending') {
    addLogEntry(`Задача в очереди: ${task.query}`, 'info');
    loadReportsList();
  }
}

function updateQueueBadge(status) {
  if (!DOM.queueStatus || !DOM.queueText) return;
  if (status.isProcessing || status.queueLength > 0) {
    DOM.queueStatus.style.display = 'block';
    DOM.queueText.textContent = status.isProcessing
      ? `Обработка... (в очереди: ${status.queueLength})`
      : `В очереди: ${status.queueLength}`;
  } else {
    DOM.queueStatus.style.display = 'none';
  }
}
