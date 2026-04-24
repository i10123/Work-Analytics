import { DOM } from '../dom.js';
import { escapeHtml } from '../utils/formatters.js';

let cachedReports = [];

/**
 * Инициализирует слушатели для сайдбара.
 */
export function setupSidebarListeners() {
  DOM.reportsSearch?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    filterAndRenderReports(query);
  });
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

      div.addEventListener('click', async (e) => {
        if (e.target.closest('.report-item__delete')) return;
        
        /** Динамический импорт для предотвращения циклической зависимости */
        const { loadReportById } = await import('../api.js');
        loadReportById(report.id);
      });

      const deleteBtn = div.querySelector('.report-item__delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteReportById(report.id, report.query);
      });

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
  if (!confirm(`Удалить отчёт по запросу "${query}"?`)) return;

  try {
    const response = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    const data = await response.json();

    if (data.success) {
      const { loadReportsList } = await import('../api.js');
      const { showToast, showScreen } = await import('./common.js');
      const { currentReport, setCurrentReport } = await import('../state.js');
      
      if (currentReport && currentReport.id === id) {
        setCurrentReport(null);
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

/**
 * Добавляет запись в UI-лог (отключено).
 */
export function addLogEntry(message, type = 'info') {
  // Метод оставлен пустым
}


