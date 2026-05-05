import { DOM } from '../dom.js';
import { escapeHtml, formatDuration } from '../utils/formatters.js';

let cachedReports = [];
let cachedQueue = [];

export function setupSidebarListeners() {
  DOM.reportsSearch?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    filterAndRenderReports(query);
  });

  DOM.reportsList?.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.report-item__delete');
    if (deleteBtn) {
      e.stopPropagation();
      const reportItem = deleteBtn.closest('.report-item');
      if (reportItem) {
        const id = reportItem.dataset.id;
        const report = cachedReports.find(r => String(r.id) === String(id));
        if (report) deleteReportById(id, report.query);
      }
      return;
    }

    const reportItem = e.target.closest('.report-item');
    if (reportItem) {
      const id = reportItem.dataset.id;
      const { loadReportById } = await import('../api.js');
      loadReportById(id);
    }
  });

  const queueList = document.getElementById('queueList');
  if (queueList) {
    queueList.addEventListener('click', (e) => {
      const item = e.target.closest('.queue-item');
      if (!item) return;
      
      const priorityBtn = e.target.closest('.queue-btn--priority');
      const editBtn = e.target.closest('.queue-btn--edit');
      const deleteBtn = e.target.closest('.queue-btn--delete');
      const id = item.dataset.id;
      
      if (priorityBtn) {
        e.stopPropagation();
        queueAction(id, 'priority');
      } else if (editBtn) {
        e.stopPropagation();
        const task = cachedQueue.find(t => String(t.id) === String(id));
        if (task) queueEdit(task);
      } else if (deleteBtn) {
        e.stopPropagation();
        queueAction(id, 'delete');
      }
    });
  }
}

/**
 * Фильтрует отчёты по поисковому запросу и рендерит их.
 */
function filterAndRenderReports(searchQuery = '') {
  if (!searchQuery) {
    renderReportsList(cachedReports, false);
    return;
  }

  const filtered = cachedReports.filter(r => 
    r.query.toLowerCase().includes(searchQuery)
  );
  renderReportsList(filtered, false);
}

/**
 * Рендерит список отчётов в боковой панели с группировкой по датам.
 * @param {Array<Object>} reports — Массив метаданных отчётов.
 * @param {boolean} updateCache — Нужно ли обновить локальный кэш отчётов.
 */
export function renderReportsList(reports, updateCache = true) {
  if (!DOM.reportsEmpty || !DOM.reportsList) return;

  if (updateCache) {
    cachedReports = reports;
  }

  /** Очищаем список (оставляя блок "пусто") */
  const existingItems = DOM.reportsList.querySelectorAll('.report-item, .sidebar__date-group');
  existingItems.forEach((el) => el.remove());

  if (reports.length === 0) {
    DOM.reportsEmpty.style.display = 'block';
    const emptyMsg = DOM.reportsEmpty.querySelector('p');
    if (emptyMsg) {
      emptyMsg.textContent = cachedReports.length > 0 
        ? 'Ничего не найдено' 
        : 'Нет сохранённых отчётов';
    }
    return;
  }

  DOM.reportsEmpty.style.display = 'none';

  // Группировка отчётов
  const groups = groupReportsByDate(reports);

  Object.entries(groups).forEach(([groupName, groupReports]) => {
    if (groupReports.length === 0) return;

    // Заголовок группы
    const groupHeader = document.createElement('div');
    groupHeader.className = 'sidebar__date-group';
    groupHeader.textContent = groupName;
    DOM.reportsList.insertBefore(groupHeader, DOM.reportsEmpty);

    groupReports.forEach((report) => {
      const div = document.createElement('div');
      div.className = 'report-item';
      div.dataset.id = report.id;

      const statusClass = `report-item__status--${report.status}`;
      const statusText = {
        completed: 'Готово',
        partial: 'Частично',
        failed: 'Ошибка',
      }[report.status] || report.status;

      const date = new Date(report.createdAt);
      const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

      div.innerHTML = `
        <div class="report-item__main">
          <div class="report-item__query">
            <svg class="report-item__icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span>${escapeHtml(report.query)}</span>
          </div>
          <div class="report-item__meta">
            <span class="report-item__date">${dateStr} <span class="report-item__at">в</span> ${timeStr}</span>
            <span class="report-item__dot">·</span>
            <span class="report-item__count">${report.stats?.totalFound || 0} вак.</span>
          </div>
        </div>
        <div class="report-item__side">
          <span class="report-item__status ${statusClass}" title="${statusText}"></span>
          <button class="report-item__delete" title="Удалить отчёт" aria-label="Удалить">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      DOM.reportsList.insertBefore(div, DOM.reportsEmpty);
    });
  });
}

/**
 * Группирует отчёты по датам (Сегодня, Вчера, Ранее).
 */
function groupReportsByDate(reports) {
  const groups = {
    'Сегодня': [],
    'Вчера': [],
    'Ранее': []
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;

  reports.forEach(report => {
    const reportDate = new Date(report.createdAt).getTime();
    if (reportDate >= today) {
      groups['Сегодня'].push(report);
    } else if (reportDate >= yesterday) {
      groups['Вчера'].push(report);
    } else {
      groups['Ранее'].push(report);
    }
  });

  return groups;
}

/**
 * Удаляет отчёт по ID с подтверждением.
 */
async function deleteReportById(id, query) {
  const { showConfirm } = await import('./settings.js');
  const confirmed = await showConfirm({
    title: 'Удалить отчёт?',
    text: `Удалить отчёт по запросу "${query}"? Это действие необратимо.`,
    icon: '🗑️',
    buttons: [
      { text: 'Да, удалить', type: 'primary', value: true },
      { text: 'Отмена', type: 'outline', value: false }
    ]
  });

  if (!confirmed) return;

  try {
    const response = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    const data = await response.json();

    if (data.success) {
      const { loadReportsList } = await import('../api.js');
      const { showToast, showScreen } = await import('./common.js');
      const state = await import('../state.js');
      
      if (state.currentReport && state.currentReport.id === id) {
        state.setCurrentReport(null);
        localStorage.removeItem('lastReportId');
        showScreen('welcome');
      }
      
      loadReportsList();
      showToast('Отчёт удалён', 'success');
    }
  } catch (error) {
    console.error('[Sidebar] ❌ Ошибка удаления отчёта:', error);
  }
}

// ────────────────────────────────────────────────
//  UI ОЧЕРЕДИ ЗАДАЧ
// ────────────────────────────────────────────────

/**
 * Загружает состояние очереди и рендерит UI.
 */
export async function loadQueueUI() {
  try {
    const response = await fetch('/api/queue');
    const data = await response.json();
    if (data.success) {
      renderQueueList(data.queue || []);

      if (DOM.queueStatus && DOM.queueText) {
        const totalActive = (data.isProcessing ? 1 : 0) + (data.queueLength || 0);
        if (totalActive >= 2) {
          DOM.queueStatus.style.display = 'block';
          DOM.queueText.textContent = data.isProcessing
            ? `Обработка... (в очереди: ${data.queueLength})`
            : `В очереди: ${data.queueLength}`;
        } else {
          DOM.queueStatus.style.display = 'none';
        }
      }
    }
  } catch (e) {
    console.warn('[Sidebar] ⚠️ Не удалось загрузить очередь:', e.message);
  }
}

let queueTimers = new Map();

/**
 * Рендерит список задач очереди в сайдбаре.
 * @param {Array} queue — Массив задач из /api/queue
 */
export function renderQueueList(queue) {
  const container = document.getElementById('queueList');
  if (!container) return;

  if (!queue || queue.length === 0) {
    container.style.display = 'none';
    queueTimers.forEach(timerId => clearInterval(timerId));
    queueTimers.clear();
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  cachedQueue = queue;

  const currentIds = new Set(queue.map(t => String(t.id)));
  Array.from(container.children).forEach(el => {
    if (!currentIds.has(el.dataset.id)) {
      const taskId = el.dataset.id;
      if (queueTimers.has(taskId)) {
        clearInterval(queueTimers.get(taskId));
        queueTimers.delete(taskId);
      }
      el.remove();
    }
  });

  queue.forEach((task, index) => {
    let div = container.querySelector(`div[data-id="${task.id}"]`);
    const statusLabels = {
      pending: '⏳ Ожидание',
      processing: '⚙️ Выполняется',
      completed: '✅ Готово',
      failed: '❌ Ошибка',
    };

    let statusLabel = statusLabels[task.status] || task.status;
    if (task.status === 'processing' && task.startedAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 1000));
      statusLabel = `⚙️ Выполняется (${formatDuration(elapsed)})`;
    }

    if (div) {
      div.className = `queue-item queue-item--${task.status}`;
      const statusEl = div.querySelector('.queue-item__status');
      if (statusEl && statusEl.textContent !== statusLabel) {
        statusEl.textContent = statusLabel;
      }
      const queryEl = div.querySelector('.queue-item__query');
      if (queryEl && queryEl.textContent !== task.query) {
        queryEl.textContent = task.query;
      }
      const limitDiv = div.querySelector('.queue-item__info > div');
      if (limitDiv) {
        limitDiv.textContent = `Лимит: ${task.filters?.limit || 50}`;
      }
      
      const actionsEl = div.querySelector('.queue-item__actions');
      if (actionsEl) {
        actionsEl.innerHTML = `
          ${task.status === 'pending' ? '<button class="queue-btn queue-btn--priority" title="В начало очереди">⬆️</button>' : ''}
          ${task.status !== 'processing' ? '<button class="queue-btn queue-btn--edit" title="Редактировать">✏️</button>' : ''}
          ${task.status !== 'processing' ? '<button class="queue-btn queue-btn--delete" title="Удалить">❌</button>' : ''}
        `;
      }
      
      if (task.status === 'processing' && task.startedAt) {
        if (!queueTimers.has(String(task.id))) {
          const timerId = setInterval(() => {
            const elapsed = Math.max(0, Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 1000));
            const statEl = div.querySelector('.queue-item__status');
            if (statEl) statEl.textContent = `⚙️ Выполняется (${formatDuration(elapsed)})`;
          }, 1000);
          queueTimers.set(String(task.id), timerId);
        }
      } else {
        if (queueTimers.has(String(task.id))) {
          clearInterval(queueTimers.get(String(task.id)));
          queueTimers.delete(String(task.id));
        }
      }
    } else {
      div = document.createElement('div');
      div.className = `queue-item queue-item--${task.status}`;
      div.dataset.id = task.id;

      div.innerHTML = `
        <div class="queue-item__info">
          <span class="queue-item__query">${escapeHtml(task.query)}</span>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 2px; margin-bottom: 2px;">
            Лимит: ${task.filters?.limit || 50}
          </div>
          <span class="queue-item__status">${statusLabel}</span>
        </div>
        <div class="queue-item__actions">
          ${task.status === 'pending' ? '<button class="queue-btn queue-btn--priority" title="В начало очереди">⬆️</button>' : ''}
          ${task.status !== 'processing' ? '<button class="queue-btn queue-btn--edit" title="Редактировать">✏️</button>' : ''}
          ${task.status !== 'processing' ? '<button class="queue-btn queue-btn--delete" title="Удалить">❌</button>' : ''}
        </div>
      `;

      container.appendChild(div);
      
      if (task.status === 'processing' && task.startedAt) {
        const timerId = setInterval(() => {
          const elapsed = Math.max(0, Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 1000));
          const statEl = div.querySelector('.queue-item__status');
          if (statEl) statEl.textContent = `⚙️ Выполняется (${formatDuration(elapsed)})`;
        }, 1000);
        queueTimers.set(String(task.id), timerId);
      }
    }
  });

  queue.forEach((task, index) => {
    const div = container.querySelector(`div[data-id="${task.id}"]`);
    if (div && container.children[index] !== div) {
      container.insertBefore(div, container.children[index]);
    }
  });
}

/**
 * Выполняет действие над задачей в очереди.
 */
async function queueAction(id, action) {
  try {
    const response = await fetch(`/api/queue/${id}/${action}`, { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      loadQueueUI();
    }
  } catch (e) {
    console.error(`[Sidebar] ❌ Ошибка ${action} задачи:`, e);
  }
}

/**
 * Открывает диалог редактирования параметров задачи (запрос, лимит).
 * Отправляет PUT /api/queue/:id.
 * @param {Object} task — Объект задачи { id, query, filters }.
 */
async function queueEdit(task) {
  const newQuery = prompt('Ключевое слово:', task.query);
  if (newQuery === null) return; // Отмена

  const currentLimit = task.filters?.limit || 50;
  const newLimitStr = prompt('Лимит вакансий (5–200):', String(currentLimit));
  if (newLimitStr === null) return; // Отмена

  const newLimit = parseInt(newLimitStr, 10);
  if (isNaN(newLimit) || newLimit < 5 || newLimit > 200) {
    const { showToast } = await import('./common.js');
    showToast('Лимит должен быть от 5 до 200', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/queue/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: newQuery.trim() || task.query, limit: newLimit }),
    });
    const data = await response.json();
    if (data.success) {
      const { showToast } = await import('./common.js');
      showToast('Параметры задачи обновлены', 'success');
      loadQueueUI();
    }
  } catch (e) {
    console.error('[Sidebar] ❌ Ошибка редактирования задачи:', e);
  }
}
