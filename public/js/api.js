import { DOM } from './dom.js';
import { escapeHtml } from './utils/formatters.js';
import { showScreen } from './ui/common.js';
import { renderDashboard } from './ui/dashboard.js';
import { setCurrentReport, setAllReports } from './state.js';
import { renderReportsList } from './ui/sidebar.js';

/**
 * Загружает список отчётов из API и рендерит сайдбар.
 */
export async function loadReportsList() {
  try {
    const response = await fetch('/api/reports');
    const data = await response.json();

    if (data.success) {
      setAllReports(data.reports);
      renderReportsList(data.reports);
      return data.reports;
    }
    return [];
  } catch (error) {
    console.error('[App] ❌ Ошибка загрузки списка отчётов:', error);
    return [];
  }
}

/**
 * Загружает полный отчёт по ID и отображает дашборд.
 * @param {string} reportId — Идентификатор отчёта.
 * @param {boolean} skipHistory — Пропустить ли добавление в историю (для popstate).
 */
export async function loadReportById(reportId, skipHistory = false) {
  try {
    const response = await fetch(`/api/reports/${reportId}`);
    const data = await response.json();

    if (data.success) {
      setCurrentReport(data.report);
      localStorage.setItem('lastReportId', reportId);
      
      if (!skipHistory) {
        history.pushState({ type: 'report', id: reportId }, '', `#report=${reportId}`);
      }

      showScreen('dashboard');
      renderDashboard(data.report);

      document.querySelectorAll('.report-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === reportId);
      });
    } else {
      localStorage.removeItem('lastReportId');
    }
  } catch (error) {
    console.error(`[App] ❌ Ошибка загрузки отчёта ${reportId}:`, error);
  }
}
