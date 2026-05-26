
import { DOM } from '../dom.js';
import { showScreen } from './common.js';
import { loadReportById, loadReportsList } from '../report.js';
import { showErrorModal } from './modal.js';
import { updateWelcomeStats } from './welcome.js';
import { loadQueueUI } from './sidebar.js';
import { formatDuration } from '../utils/formatters.js';
import { appStore, clientId } from '../state.js';

export function setupSSE() {
  console.log('[App] 📡 Подключение к SSE...');
  const eventSource = new EventSource('/api/events?clientId=' + clientId);


  let isDisconnected = false;

  eventSource.onopen = async () => {
    console.log('[App] 📡 SSE-соединение установлено.');
    if (isDisconnected) {
      console.log('[App] 🔄 Восстановление после обрыва. Синхронизация состояния...');
      isDisconnected = false;
      import('./common.js').then(({ showToast }) => {
        showToast('Соединение восстановлено. Синхронизация...', 'success');
      });

      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        
        if (data.success) {
          if (data.currentTask) {
            handleTaskUpdate(data.currentTask);
          } else if (progressTimerInterval) {
            
            await loadReportsList();
            const { allReports } = appStore.getState();
            if (allReports.length > 0) {
              const latest = allReports[0];
              
              handleTaskUpdate({
                status: latest.status,
                reportId: latest.id,
                error: latest.error
              });
            }
          }
          
          updateQueueBadge(data);
        }
      } catch (err) {
        console.error('[App] ❌ Ошибка синхронизации очереди:', err);
      }
    }
  };

  eventSource.addEventListener('taskUpdate', (event) => {
    try {
      const task = JSON.parse(event.data);
      console.log(`[App] 📡 SSE taskUpdate:`, task);
      handleTaskUpdate(task);
    } catch (e) {
      console.error('[App] ❌ Ошибка разбора SSE taskUpdate:', e, event.data);
    }
  });

  eventSource.addEventListener('queueStatus', (event) => {
    try {
      const status = JSON.parse(event.data);
      updateQueueBadge(status);
    } catch (e) {
      console.error('[App] ❌ Ошибка разбора SSE queueStatus:', e, event.data);
    }
  });

  eventSource.onerror = () => {
    if (!isDisconnected) {
      console.warn('[App] ⚠️ SSE-соединение потеряно. Переподключение...');
      isDisconnected = true;
      import('./common.js').then(({ showToast }) => {
        showToast('Соединение с сервером потеряно. Переподключение...', 'warning');
      });
    }
  };

  window.addEventListener('beforeunload', (e) => {
    if (progressTimerInterval) {
      e.preventDefault();
      e.returnValue = ''; 
    }
  });

  if (DOM.btnStopParsing) {
    DOM.btnStopParsing.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        if (data.currentTask) {
          await fetch(`/api/queue/${data.currentTask.id}/stop`, { method: 'POST' });
          const { showToast } = await import('./common.js');
          showToast('Остановка сбора данных...', 'warning');
          DOM.btnStopParsing.disabled = true;
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
}

let progressTimerInterval = null;
let progressStartTime = null;

async function handleTaskUpdate(task) {
  if (task.status === 'processing') {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    if (!window.isProgressMinimized) {
      showScreen('progress');
    }
    if (DOM.btnStopParsing) DOM.btnStopParsing.disabled = false;
    if (DOM.progressTitle) DOM.progressTitle.textContent = `Сбор данных: "${task.query || ''}"`;
    if (task.step && DOM.progressStep) {
      DOM.progressStep.textContent = task.step;
    }
    
    if (task.progress !== undefined && DOM.progressFill) {
      DOM.progressFill.style.width = `${task.progress}%`;
    }
    
    if (!progressTimerInterval) {
      progressStartTime = task.startedAt ? new Date(task.startedAt).getTime() : Date.now();
      if (DOM.progressTime) {
        DOM.progressTime.textContent = `Прошло времени: 0 сек.`;
      }
      progressTimerInterval = setInterval(() => {
        const elapsed = Math.max(0, Math.floor((Date.now() - progressStartTime) / 1000));
        if (DOM.progressTime) DOM.progressTime.textContent = `Прошло времени: ${formatDuration(elapsed)}`;
      }, 1000);
    }
  } else if (task.status === 'completed' || task.status === 'partial') {
    if (progressTimerInterval) {
      clearInterval(progressTimerInterval);
      progressTimerInterval = null;
    }
    const totalSeconds = progressStartTime ? Math.max(0, Math.floor((Date.now() - progressStartTime) / 1000)) : 0;
    progressStartTime = null;

    const msg = task.status === 'completed' 
      ? `Сбор успешно завершен за ${formatDuration(totalSeconds)}` 
      : `Сбор завершен (или прерван) за ${formatDuration(totalSeconds)}`;
    
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification("Work Analytics", { 
        body: msg, 
        icon: '/favicon.ico' 
      });
    }

    const { showToast } = await import('./common.js');
    showToast(msg, task.status === 'completed' ? 'success' : 'warning');

    if (task.reportId) {
      loadReportById(task.reportId);
    }
    loadReportsList().then(() => updateWelcomeStats());
  } else if (task.status === 'failed') {
    if (progressTimerInterval) {
      clearInterval(progressTimerInterval);
      progressTimerInterval = null;
    }
    const totalSeconds = progressStartTime ? Math.max(0, Math.floor((Date.now() - progressStartTime) / 1000)) : 0;
    progressStartTime = null;

    showScreen('welcome');
    const errorMsg = task.error || 'Неизвестная ошибка сервера.';
    showErrorModal('Ошибка сбора данных', `${errorMsg}\n\nСбор прерван через: ${formatDuration(totalSeconds)}`);
    loadReportsList().then(() => updateWelcomeStats());
  } else if (task.status === 'pending') {
    loadReportsList();
  }
  loadQueueUI();
}

function updateQueueBadge(status) {
  if (!DOM.queueStatus || !DOM.queueText) return;
  const totalActive = (status.isProcessing ? 1 : 0) + (status.queueLength || 0);
  if (totalActive >= 2) {
    DOM.queueStatus.style.display = 'block';
    DOM.queueText.textContent = status.isProcessing
      ? `Обработка... (в очереди: ${status.queueLength})`
      : `В очереди: ${status.queueLength}`;
  } else {
    DOM.queueStatus.style.display = 'none';
  }
}
